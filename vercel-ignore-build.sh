#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vercel « Ignored Build Step » (appelé par ignoreCommand dans vercel.json)
#   exit 0  => Vercel IGNORE le build (aucun déploiement créé)
#   exit 1  => Vercel CONSTRUIT et déploie normalement
#
# Principe : en cas de doute, on DÉPLOIE. On n'ignore un build que si l'on
# est certain qu'aucun fichier réellement servi par le site n'a changé
# depuis le dernier déploiement réussi.
#
# Build ignoré si :
#   A. seuls sitemap.xml et/ou des fichiers hors déploiement ont changé ;
#   B. seuls des fichiers de doc / tests / audits / exclus (.vercelignore)
#      ont changé ;
#   C. le message du commit contient [skip ci] ou [skip deploy]
#      ET aucun commit antérieur non encore déployé ne touche le site.
# ---------------------------------------------------------------------------
set -u

build() { echo "[ignore-build] CONSTRUIRE : $1"; exit 1; }
skip()  { echo "[ignore-build] IGNORER : $1"; exit 0; }

# Fichiers dont la modification seule ne justifie pas un déploiement.
# Doit rester cohérent avec .vercelignore (+ sitemap.xml, cas A).
is_ignorable() {
  case "$1" in
    sitemap.xml) return 0 ;;
    docs/*|tests/*|scripts/*|prototypes/*) return 0 ;;
    "Indexation auto/"*|"Audits SEO/"*|"Lead magnets/"*|"Claude outputs/"*) return 0 ;;
    .github/*|.claude/*|blog/.claude/*) return 0 ;;
    *.md|*.bak|*.bak.*|*.skill|*.bat) return 0 ;;
    .gitignore|.gitattributes) return 0 ;;
    images/transmission.jpg|images/optimisation-fiscale.jpg) return 0 ;;
    images/courtier-credit.jpg|images/investissement-immobilier.jpg) return 0 ;;
    images/placement-financier.jpg|images/declaration-impot.jpg) return 0 ;;
    images/cession-entreprise.jpg|images/retraite.jpg) return 0 ;;
    *) return 1 ;;
  esac
}

# Liste (séparée par NUL) des fichiers modifiés entre deux commits.
# Retourne 0 si AU MOINS UN fichier touche le site ; 1 sinon.
touches_site() {
  local found=1 f
  while IFS= read -r -d '' f; do
    if ! is_ignorable "$f"; then
      echo "[ignore-build]   fichier du site modifié : $f"
      found=0
    fi
  done < <(git diff --name-only -z "$1" "$2" --)
  return $found
}

HEAD_SHA="$(git rev-parse HEAD 2>/dev/null)" || build "dépôt git illisible"
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"

# Pas de référence fiable => on déploie.
[ -n "$BASE" ] || build "aucun déploiement précédent connu (VERCEL_GIT_PREVIOUS_SHA vide)"
if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin "$BASE" 2>/dev/null || true
fi
git cat-file -e "${BASE}^{commit}" 2>/dev/null || build "commit précédent $BASE introuvable dans le clone"
[ "$BASE" != "$HEAD_SHA" ] || build "même commit que le déploiement précédent (redéploiement)"

# Liste complète des fichiers modifiés depuis le dernier déploiement réussi.
CHANGED="$(git diff --name-only "$BASE" "$HEAD_SHA" -- 2>/dev/null)" || build "git diff impossible"
[ -n "$CHANGED" ] || build "aucune différence de fichiers détectée (cas atypique)"

# Sécurité : des commits antérieurs non encore déployés touchent-ils le site ?
PARENT="$(git rev-parse "${HEAD_SHA}^" 2>/dev/null || true)"
if [ -n "$PARENT" ] && [ "$PARENT" != "$BASE" ]; then
  if touches_site "$BASE" "$PARENT"; then
    build "des commits précédents non déployés modifient le site"
  fi
fi

# C. Demande explicite dans le message du commit.
MSG="${VERCEL_GIT_COMMIT_MESSAGE:-$(git log -1 --format=%B "$HEAD_SHA" 2>/dev/null)}"
case "$MSG" in
  *"[skip ci]"*|*"[skip deploy]"*) skip "message du commit contenant [skip ci] ou [skip deploy]" ;;
esac

# A + B. Seuls des fichiers hors site ont changé ?
if touches_site "$BASE" "$HEAD_SHA"; then
  build "modification réelle du site"
fi
skip "seuls sitemap.xml et/ou des fichiers hors déploiement ont changé"
