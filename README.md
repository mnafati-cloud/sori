# 소리 Sori — apprentissage du coréen

PWA personnelle de révision de coréen (remplaçant d'Anki), FR ⇄ KR.

- **Échelle de maîtrise** par mot : QCM facile → QCM piégeux (distracteurs de confusion réelle) → QCM FR→KR → rappel indicé → rappel pur.
- **Audio** (synthèse vocale coréenne du navigateur) + mode **Écoute**.
- **Kit de survie voyage** (~54 phrases, drill audio/shadowing).
- 100 % hors-ligne (service worker), progression en localStorage, export/import JSON.

L'app vit dans [`docs/`](docs/) (servie par GitHub Pages).
`tools/build_data.py` régénère `docs/data.js` depuis un snapshot de collection Anki (snapshot exclu du repo).

⚠️ La progression n'est PAS dans le repo : elle reste sur l'appareil. Faire des exports réguliers (onglet Stats → Exporter).
