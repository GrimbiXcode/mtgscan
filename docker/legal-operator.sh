#!/bin/sh
# Setzt die Betreiberangaben (LEGAL_OPERATOR_*) beim Containerstart in die
# Rechtsseiten ein. Läuft über /docker-entrypoint.d/ des nginx-Images, bevor
# nginx startet.
#
# Bewusst zur Laufzeit statt beim Bauen: Die Seiten sind statisch, jede
# Instanz hat aber ihren eigenen Betreiber. So genügt nach einer Änderung ein
# Neustart, und mehrzeilige Werte müssen nicht durch den Docker-Bau.
#
# Schreibweise wie in filahub: Zeilenumbrüche als \n (auch doppelt escapt als
# \\n oder als <br>), Leerzeilen und Leerräume am Zeilenrand fallen weg. Die
# Werte werden HTML-escapt – rohes HTML aus der Umgebung landet nie im Markup.
#
# Die Originale mit Platzhaltern werden beim ersten Start gesichert und bei
# jedem Start neu gerendert, damit geänderte Werte nach einem Neustart auch
# ohne neuen Container greifen.
set -eu

ROOT=/usr/share/nginx/html
TEMPLATES=/usr/share/nginx/legal-templates
KEYS="LEGAL_OPERATOR_NAME LEGAL_OPERATOR_ADDRESS LEGAL_OPERATOR_EMAIL LEGAL_OPERATOR_HOSTING"

if [ ! -d "$TEMPLATES" ]; then
  mkdir -p "$TEMPLATES"
  find "$ROOT" -name '*.html' -exec grep -l '{{LEGAL_OPERATOR_' {} + 2>/dev/null |
    while read -r file; do
      rel=${file#"$ROOT"/}
      mkdir -p "$TEMPLATES/$(dirname "$rel")"
      cp "$file" "$TEMPLATES/$rel"
    done
fi

for key in $KEYS; do
  eval "value=\${$key:-}"
  if [ -z "$(printf '%s' "$value" | tr -d ' \t\r\n')" ]; then
    echo "[legal-operator] $key fehlt – Impressum und Datenschutz weisen sichtbar darauf hin" >&2
  fi
done

find "$TEMPLATES" -type f -name '*.html' | while read -r template; do
  awk '
    function render(key,   value, lines, n, i, line, out) {
      value = ENVIRON[key]
      gsub(/\r/, "", value)
      gsub(/<[Bb][Rr][ \t]*\/?>/, "\n", value)
      gsub(/\\+n/, "\n", value)
      n = split(value, lines, "\n")
      out = ""
      for (i = 1; i <= n; i++) {
        line = lines[i]
        sub(/^[ \t]+/, "", line)
        sub(/[ \t]+$/, "", line)
        if (line == "") continue
        gsub(/&/, "\\&amp;", line)
        gsub(/</, "\\&lt;", line)
        gsub(/>/, "\\&gt;", line)
        gsub(/"/, "\\&quot;", line)
        out = out (out == "" ? "" : "<br>") line
      }
      if (out == "") out = "<em class=\"legal-missing\">[Angabe fehlt: " key "]</em>"
      return out
    }
    {
      result = ""
      while (match($0, /\{\{LEGAL_OPERATOR_[A-Z]+\}\}/)) {
        key = substr($0, RSTART + 2, RLENGTH - 4)
        result = result substr($0, 1, RSTART - 1) render(key)
        $0 = substr($0, RSTART + RLENGTH)
      }
      print result $0
    }
  ' "$template" > "$ROOT/${template#"$TEMPLATES"/}"
done
