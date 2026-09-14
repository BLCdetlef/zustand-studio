# ZUSTAND Studio

Neustart der webbasierten Studio- und Redaktionsanwendung für das Projekt ZUSTAND / BRUCHLAST.

## Ziel der ersten Version
Recherche → Kandidaten → Akquise → Interview → Z-Panel-Entwurf.

Die Recherche folgt dem Prinzip **„erst Messreihe, dann Mensch“**.

## Datenschutz / Speicher
Das Studio speichert Arbeitsdaten lokal im Browser oder verschlüsselt im privaten App-Datenbereich von Google Drive.
Es werden keine Arbeitsdaten an GitHub übertragen.

**Nicht für sensible oder besonders schutzbedürftige personenbezogene Daten verwenden.**

Die Speicherschicht ist bewusst gekapselt (`LocalDemoStorage` in `app.js`). Sie soll später durch eine von der TH Lübeck freigegebene Lösung (z. B. Nextcloud/THL-Infrastruktur) ersetzt werden können.

### Experimentelle verschlüsselte Drive-Synchronisation

Im Fußbereich steht eine manuelle Testsynchronisation zur Verfügung. Sie verschlüsselt den vollständigen Studio-Datenstand bereits im Browser mit AES-256-GCM; das Studio-Passwort wird nicht gespeichert. Google Drive erhält nur die verschlüsselte Hülldatei im privaten App-Datenbereich. Die Anwendung fordert dafür ausschließlich den eng begrenzten OAuth-Bereich `drive.appdata` an.

Für die Verbindung ist die öffentliche OAuth-Web-Client-ID des Projekts `ZUSTAND Studio` vorkonfiguriert. Ein Client-Schlüssel wird von der Browseranwendung weder benötigt noch gespeichert. Solange die Verbindung nicht ausdrücklich ausgelöst wurde, arbeitet das Studio unverändert ausschließlich lokal. Laden und Speichern erfolgen absichtlich manuell und jeweils nach Bestätigung. Vor realen sensiblen Daten müssen OAuth-Konfiguration, Wiederherstellung, Konfliktschutz, Passwortaufbewahrung und Löschkonzept vollständig getestet und dokumentiert werden.

Nach erfolgreichem verschlüsseltem Speichern kann der lokale Klartext über **Lokalen Klartext entfernen** ausdrücklich gelöscht werden. Anschließend arbeitet die geöffnete Seite ohne lokale Klartextkopie. Beim Schließen oder Neuladen wird die Sitzung gesperrt; die Daten müssen mit dem Studio-Passwort aus dem verschlüsselten Zwischenstand oder aus Drive geladen werden. Ein leerer Datenstand kann nicht als Online-Datei gespeichert werden.

Während einer geschützten Sitzung legt das Studio nach Änderungen zusätzlich einen verschlüsselten lokalen Zwischenstand ab. Nach versehentlichem Neuladen kann er mit **Zwischenstand laden** und demselben Studio-Passwort wiederhergestellt werden. Ein gelber Speicherstatus und die Browser-Warnung kennzeichnen Änderungen, die noch nicht nach Drive übertragen wurden. Der Zwischenstand ersetzt keine regelmäßige Drive-Speicherung.

Beim erneuten Öffnen weist ein auffälliger gelber Wiederherstellungsbalken direkt am oberen Seitenrand auf einen vorhandenen verschlüsselten Zwischenstand hin und führt zum Passwortfeld. Das Studio-Passwort selbst bleibt weiterhin ungespeichert.

Einzelne Kandidaten können direkt in der Kandidatenliste nach einer namentlichen Sicherheitsabfrage gelöscht werden. Zugehörige Akquise- und Interviewdaten werden dabei mit entfernt; vorhandene Z-Panel-Beiträge bleiben erhalten und werden lediglich vom Kandidaten entkoppelt.

## Hosting
Die Anwendung besteht nur aus statischem HTML, CSS und JavaScript und ist nicht an GitHub Pages gebunden. Sie kann später auf eine andere Hosting-Infrastruktur umziehen.

## Bestehendes Z-Panel
Das bestehende Z-Panel bleibt unabhängig. Der Z-Panel-Bereich dieser Anwendung erzeugt zunächst nur interne Entwürfe.

## Version 1.1
Die Recherche enthält jetzt die Auswahl **Deutsch bevorzugt / Deutsch erforderlich / Englisch möglich**.

## GWL-Wissensimport

Unter **Kandidaten → JSON importieren** kann neben dem Studio-Kandidatenformat auch ein Wissensnetz im Format `gwl-knowledge-network-v1.3` gewählt werden. Das Studio übernimmt daraus nur ein kompaktes Arbeitsprofil für Kandidatenauswahl und Interviewvorbereitung. GWL-Format, Version, Status und die IDs der verwendeten Evidenzen, Messwerte, Wirkungspfade, Quellen und Wissenslücken bleiben als Herkunftsnachweis verknüpft.

Im Interviewbereich kann anschließend ein **GWL-Rückspielentwurf** exportiert werden. Dieser ist immer als redaktioneller Entwurf gekennzeichnet und darf erst nach wissenschaftlicher Quellen- und Evidenzprüfung in GWL übernommen werden.

Die Interviewvorbereitung verwendet drei Felder: **An- und Abmoderation + erste Frage**, **Kernthemen** und **Inhalte für GWL-Panel**.

Optional kann ein Interview mit einer konkreten BLC26-Kurve verknüpft werden. Kurventitel, stabile Kurven-ID und Link bleiben am Interview gespeichert, erscheinen im Interview-Bildschirm und können in einen neuen Z-Panel-Entwurf übernommen werden. Interviews und Beiträge ohne Kurvenbezug bleiben möglich.

Der Interviewbereich führt durch fünf Arbeitsschritte: **Vorbereitung → Aufnahme → Veröffentlichung → Transkript → Z-Beitrag**. OKL-, Castopod- und weitere Podcast-Links sowie ein internes Transkript bleiben beim Interview gespeichert. Ein einmal angelegter Z-Beitrag wird beim erneuten Aufruf geöffnet statt dupliziert.

Unter **Aufnahme** stehen vergrößerbare Referenzfotos des Digitalmischpults im Offenen Kanal Lübeck und des RØDECaster Pro in der MPA als mobile Aufnahmehilfe bereit.

In der Interviewvorbereitung können außerdem die stabilen IDs und Direktlinks eines GWL-Beitrags und einer BLC26-Kurve hinterlegt werden. Beim Wechsel des Akquise-Status auf **zugesagt** erzeugt das Studio daraus die zweite E-Mail zur Terminabstimmung und gemeinsamen fachlichen Prüfung. Bereits individuell bearbeitete Entwürfe werden ansonsten nicht automatisch ersetzt.

### Transkript-Redaktion

Im Arbeitsschritt **Transkript** kann ein Groq-`verbose_json` mit Segment-Zeitmarken importiert werden. Die Zeitmarken springen im hinterlegten Audio direkt zur passenden Stelle. Korrekturen, Suchen/Ersetzen sowie TXT- und JSON-Export erfolgen lokal im Browser. Der verbindliche Ablauf lautet **Entwurf → In Prüfung → Freigegeben**; jede spätere Textänderung setzt den Status wieder auf Entwurf.

Für einen lokalen Groq-Test:

1. `.env.local.example` nach `.env.local` kopieren und den API-Schlüssel eintragen. `.env.local` wird von Git ignoriert.
2. `node scripts/transcribe-groq.mjs [optionale-audio-url]` ausführen.
3. Die erzeugte JSON-Datei aus `transcripts/` im Interviewbereich importieren.

Der Helfer übergibt die öffentliche Audio-URL an Groq und speichert die Audiodatei nicht lokal. `transcripts/` wird ebenfalls nicht in Git aufgenommen.
