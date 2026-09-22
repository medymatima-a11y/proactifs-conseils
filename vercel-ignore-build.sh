#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Vercel « Ignored Build Step » (appelé par ignoreCommand dans vercel.json)
#   exit 0  => Vercel IGNORE le build (aucun déploiement créé)
#   exit 1  => Vercel CONSTRUIT et déploie normalement
#
# RÈGLE ABSOLUE : les fichiers modifiés priment sur le message du commit.
#
# 1. On liste TOUS les fichiers modifiés depuis le dernier déploiement réussi
#    (VERCEL_GIT_PREVIOUS_SHA..HEAD), commits accumulés compris.
# 2. Si au moins UN fichier n'est pas explicitement ignorable => BUILD,
#    quel que soit le message ([skip ci] / [skip deploy] n'y changent rien).
# 3. Si TOUS les fichiers sont ignorables (sitemap.xml, doc, tests, audits,
#    scripts de dev, fichiers exclus par .vercelignore) => IGNORE.
#
# Fail-safe : SHA précédent absent ou invalide, erreur git, liste vide,
# fichier non reconnu => BUILD.
# ---------------------------------------------------------------------------
set -u

build() { echo "[ignore-build] CONSTRUIRE : $1"; exit 1; }
skip()  { echo "[ignore-build] IGNORER : $1"; exit 0; }

# Liste blanche STRICTE des fichiers dont la modification seule ne justifie
# pas un déploiement. Tout ce qui n'est pas listé ici déclenche un build.
# Doit rester cohérente avec .vercelignore (+ sitemap.xml).
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

# --- 1. Références ----------------------------------------------------------
HEAD_SHA="$(git rev-parse --verify HEAD 2>/dev/null)" || build "HEAD illisible (erreur git)"
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$BASE" ] || build "VERCEL_GIT_PREVIOUS_SHA absent"
case "$BASE" in
  *[!0-9a-fA-F]*) build "VERCEL_GIT_PREVIOUS_SHA invalide" ;;
esac
if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin "$BASE" 2>/dev/null || true
fi
git cat-file -e "${BASE}^{commit}" 2>/dev/null || build "commit précédent $BASE introuvable"
[ "$BASE" != "$HEAD_SHA" ] || build "même commit que le déploiement précédent"

# --- 2. Tous les fichiers modifiés depuis le dernier déploiement ------------
# --no-renames : un renommage apparaît comme suppression + ajout (les deux
# chemins sont examinés). Sortie dans un fichier pour contrôler le code retour.
LIST="$(mktemp 2>/dev/null)" || build "mktemp impossible"
trap 'rm -f "$LIST"' EXIT
git diff --no-renames --name-only -z "$BASE" "$HEAD_SHA" -- > "$LIST" 2>/dev/null \
  || build "git diff en erreur"
[ -s "$LIST" ] || build "aucun fichier modifié détecté (cas atypique)"

# --- 3. Décision : les fichiers priment ------------------------------------
N=0
while IFS= read -r -d '' f; do
  N=$((N+1))
  if ! is_ignorable "$f"; then
    build "fichier du site modifié : $f"
  fi
done < "$LIST"
[ "$N" -gt 0 ] || build "liste de fichiers illisible"

MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"
case "$MSG" in
  *"[skip ci]"*|*"[skip deploy]"*) TAG=" (tag présent dans le message)" ;;
  *) TAG="" ;;
esac
skip "les $N fichier(s) modifié(s) sont tous hors site${TAG}"
