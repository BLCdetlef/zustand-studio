# ZUSTAND Studio – Prototyp

Neustart der webbasierten Studio- und Redaktionsanwendung für das Projekt ZUSTAND / BRUCHLAST.

## Ziel der ersten Version
Recherche → Kandidaten → Akquise → Interview → Z-Panel-Entwurf.

Die Recherche folgt dem Prinzip **„erst Messreihe, dann Mensch“**.

## Datenschutz / Speicher
Diese Prototyp-Version speichert Arbeitsdaten ausschließlich im `localStorage` des verwendeten Browsers.
Es werden keine Arbeitsdaten an GitHub übertragen.

**Nicht für sensible oder besonders schutzbedürftige personenbezogene Daten verwenden.**

Die Speicherschicht ist bewusst gekapselt (`LocalDemoStorage` in `app.js`). Sie soll später durch eine von der TH Lübeck freigegebene Lösung (z. B. Nextcloud/THL-Infrastruktur) ersetzt werden können.

## Hosting
Die Anwendung besteht nur aus statischem HTML, CSS und JavaScript und ist nicht an GitHub Pages gebunden. Sie kann später auf eine andere Hosting-Infrastruktur umziehen.

## Bestehendes Z-Panel
Das bestehende Z-Panel bleibt unabhängig. Der Z-Panel-Bereich dieser Anwendung erzeugt zunächst nur interne Entwürfe.
