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
# 3. sitemap.xml : ignorable UNIQUEMENT si l'ensemble des URL <loc> est
#    identique entre VERCEL_GIT_PREVIOUS_SHA et HEAD (seuls lastmod / ordre
#    changent). URL ajoutée, retirée ou remplacée => BUILD.
# 4. Si TOUS les fichiers sont ignorables (doc, tests, audits, scripts de dev,
#    fichiers exclus par .vercelignore, sitemap sans changement d'URL) => IGNORE.
#
# Fail-safe : SHA précédent absent ou invalide, erreur git, liste vide,
# fichier non reconnu, sitemap inaccessible / illisible / vide => BUILD.
# ---------------------------------------------------------------------------
set -u

build() { echo "[ignore-build] CONSTRUIRE : $1"; exit 1; }
skip()  { echo "[ignore-build] IGNORER : $1"; exit 0; }

# Liste blanche STRICTE des fichiers dont la modification seule ne justifie
# pas un déploiement. Tout ce qui n'est pas listé ici déclenche un build.
# Doit rester cohérente avec .vercelignore. (sitemap.xml est traité à part.)
is_ignorable() {
  case "$1" in
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

# Extrait la liste triée et dédoublonnée des URL <loc> d'un sitemap.
#   $1 = fichier XML source, $2 = fichier de sortie
# Retourne 1 (=> BUILD) si le fichier est vide, sans balise fermante
# </urlset>, sans aucune <loc>, ou si une <loc> n'est pas extractible.
extract_locs() {
  local src="$1" dst="$2" n_open n_ok
  [ -s "$src" ] || return 1
  tr -d '\r' < "$src" > "$src.n" || return 1
  grep -q '</urlset>\|</sitemapindex>' "$src.n" || return 1
  n_open="$(grep -o '<loc[ >]' "$src.n" | wc -l)" || return 1
  n_ok="$(grep -o '<loc>[^<]*</loc>' "$src.n" | wc -l)" || return 1
  [ "$n_open" -gt 0 ] && [ "$n_open" -eq "$n_ok" ] || return 1
  grep -o '<loc>[^<]*</loc>' "$src.n" \
    | sed -e 's#^<loc>##' -e 's#</loc>$##' \
          -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | LC_ALL=C sort -u > "$dst" || return 1
  [ -s "$dst" ] || return 1
  ! grep -q '^$' "$dst" || return 1
  return 0
}

# Compare l'ensemble des URL du sitemap entre BASE et HEAD.
# Retour 0 = mêmes URL (ignorable). Sinon appelle build() (exit 1).
sitemap_urls_unchanged() {
  local d="$1"
  git show "${BASE}:sitemap.xml" > "$d/old.xml" 2>/dev/null \
    || build "ancien sitemap inaccessible"
  git show "${HEAD_SHA}:sitemap.xml" > "$d/new.xml" 2>/dev/null \
    || build "nouveau sitemap inaccessible (supprimé ?)"
  extract_locs "$d/old.xml" "$d/old.txt" \
    || build "ancien sitemap illisible (extraction des <loc> impossible)"
  extract_locs "$d/new.xml" "$d/new.txt" \
    || build "nouveau sitemap illisible, vide ou invalide"
  if cmp -s "$d/old.txt" "$d/new.txt"; then
    echo "[ignore-build]   sitemap.xml : mêmes $(wc -l < "$d/new.txt" | tr -d ' ') URL (seuls lastmod/ordre changent)"
    return 0
  fi
  echo "[ignore-build]   URL retirées : $(LC_ALL=C comm -23 "$d/old.txt" "$d/new.txt" | head -5 | tr '\n' ' ')"
  echo "[ignore-build]   URL ajoutées : $(LC_ALL=C comm -13 "$d/old.txt" "$d/new.txt" | head -5 | tr '\n' ' ')"
  build "structure des URL du sitemap modifiée"
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
TMPD="$(mktemp -d 2>/dev/null)" || build "mktemp impossible"
trap 'rm -rf "$TMPD"' EXIT
LIST="$TMPD/list"
git diff --no-renames --name-only -z "$BASE" "$HEAD_SHA" -- > "$LIST" 2>/dev/null \
  || build "git diff en erreur"
[ -s "$LIST" ] || build "aucun fichier modifié détecté (cas atypique)"

# --- 3. Décision : les fichiers priment ------------------------------------
N=0
SITEMAP_CHANGED=0
while IFS= read -r -d '' f; do
  N=$((N+1))
  if [ "$f" = "sitemap.xml" ]; then
    SITEMAP_CHANGED=1
  elif ! is_ignorable "$f"; then
    build "fichier du site modifié : $f"
  fi
done < "$LIST"
[ "$N" -gt 0 ] || build "liste de fichiers illisible"

# --- 4. sitemap.xml : ignorable seulement si les URL sont identiques --------
if [ "$SITEMAP_CHANGED" -eq 1 ]; then
  sitemap_urls_unchanged "$TMPD" || build "comparaison du sitemap en erreur"
fi

MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"
case "$MSG" in
  *"[skip ci]"*|*"[skip deploy]"*) TAG=" (tag présent dans le message)" ;;
  *) TAG="" ;;
esac
skip "les $N fichier(s) modifié(s) sont tous hors site${TAG}"
