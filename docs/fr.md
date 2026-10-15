# Epic Games Store

Chaque semaine, l'Epic Games Store offre un ou plusieurs jeux PC, à garder pour toujours une fois
récupérés. Cette intégration suit ces offres dans Gladys : les jeux gratuits du moment et leur date
de fin, les prochains et leur date de début, un widget avec les affiches, et un déclencheur de scène
pour être prévenu dès qu'un nouveau jeu est disponible.

Elle est **en lecture seule** : elle ne récupère pas les jeux à votre place, elle vous dit quand
aller les chercher.

> Intégration non officielle, sans lien avec Epic Games. Epic Games Store est une marque d'Epic
> Games, Inc.

> **Développée sans accès à l'API réelle** : elle a été mise au point sur des réponses
> enregistrées de la boutique (celles des tests de l'intégration Home Assistant). Vos retours sont
> les bienvenus.

## Prérequis

- Gladys Assistant **5.1.0** ou plus récent (widgets et déclencheurs de scène).
- Un accès à Internet depuis Gladys. Aucun compte Epic, aucune clé d'API.

## Configuration

1. Installez l'intégration depuis le catalogue (ou **Intégrations → Installer depuis GitHub**).
2. Dans l'onglet **Configuration** :
   - **Langue** : la langue des textes de l'appareil, des variables de scène, des titres et des
     liens de la boutique (français par défaut) ;
   - **Pays** : le code de deux lettres de votre région de boutique (`FR` par défaut, `BE`, `CH`,
     `CA`…). Les jeux offerts peuvent varier d'un pays à l'autre.
3. Enregistrez, puis ouvrez l'onglet **Découverte** et ajoutez l'appareil **Epic Games Store**.

Le bouton **Actualiser maintenant** lit la boutique tout de suite et affiche sous le bouton les
jeux gratuits du moment et les suivants : pratique pour vérifier le pays choisi.

## L'appareil

Un seul appareil, **Epic Games Store**, en lecture seule :

| Fonctionnalité                 | Contenu                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| Jeux gratuits                  | Les titres des jeux gratuits en ce moment, séparés par « · » |
| Gratuits jusqu'au              | La fin de l'offre (la plus proche s'il y en a plusieurs)     |
| Jeux gratuits en ce moment     | Leur nombre                                                  |
| Prochains jeux gratuits        | Les titres des prochains jeux annoncés                       |
| Prochains jeux gratuits dès le | Le début de la prochaine offre                               |
| Jeux gratuits à venir          | Leur nombre                                                  |

Les dates sont écrites dans le fuseau horaire de Gladys, par exemple « jeu. 22 oct., 17:00 ». Sans
jeu, les titres valent « Aucun » et les dates « — ».

Pendant les opérations spéciales (Noël, Mega Sale), Epic annonce des **jeux mystère** : ils
apparaissent sous le nom « Jeu mystère » jusqu'à ce qu'Epic les dévoile.

Les noms des fonctionnalités sont fixés par Gladys à l'ajout de l'appareil, dans la langue choisie
à ce moment-là. Changer ensuite de langue traduit les valeurs, pas les noms.

## Le widget

Ajoutez au tableau de bord le widget **Jeux gratuits Epic** :

- une ligne de résumé (« 2 gratuit(s) · 2 à venir ») ;
- les jeux gratuits puis les prochains, avec leur affiche, un badge **Gratuit** ou **Bientôt** et
  la date (de fin pour un jeu gratuit, de début pour un jeu à venir) ;
- en touchant un jeu : la date, l'éditeur, le prix habituel, la description et le lien vers la
  boutique ;
- un bouton **Tous les jeux gratuits** vers la page de la boutique.

Réglage **Affichage** : grille d'affiches (par défaut) ou liste. Le widget est écrit dans la langue
de l'utilisateur qui le regarde ; les affiches sont téléchargées et redimensionnées par
l'intégration, votre navigateur ne contacte jamais Epic.

## Le déclencheur de scène

**Nouveau jeu gratuit disponible** se déclenche **une fois par jeu**, au moment où il devient
gratuit (le jeudi vers 17 h, heure de Paris, et chaque jour pendant l'opération de Noël). Il met à
disposition de la scène :

| Variable                         | Exemple                                          |
| -------------------------------- | ------------------------------------------------ |
| Titre du jeu                     | Filament                                         |
| Gratuit jusqu'au (date et heure) | jeu. 10 nov., 17:00                              |
| Gratuit jusqu'au (ISO 8601)      | 2022-11-10T16:00:00.000Z                         |
| Lien vers la boutique            | https://store.epicgames.com/fr/p/filament-332a92 |
| Éditeur                          | Kasedo Games Ltd                                 |
| Prix habituel                    | 16,99 €                                          |

À savoir :

- à la toute première lecture, les jeux déjà gratuits ne sont **pas** annoncés (installer
  l'intégration un samedi n'annonce pas le jeu offert depuis jeudi) ;
- un jeu mystère est annoncé une fois dévoilé, sous son vrai titre ;
- les jeux déjà annoncés sont retenus dans `/data` : un redémarrage ou une mise à jour ne les
  annonce pas une seconde fois ;
- changer de pays repart de zéro : les jeux déjà gratuits dans le nouveau pays ne sont pas
  annoncés.

L'intégration n'a pas d'action de scène : les valeurs de l'appareil suffisent pour une condition.

## Exemples de scènes

- **Notification** : déclencheur « Nouveau jeu gratuit disponible », puis action « Envoyer un
  message » : « 🎮 Titre du jeu est gratuit jusqu'au Gratuit jusqu'au (date et heure) : Lien vers
  la boutique », en insérant chaque variable depuis le sélecteur de l'éditeur.
- **Rappel avant la fin** : chaque mercredi à 19 h, si **Jeux gratuits en ce moment** est supérieur
  à 0, envoyer « Dernier jour pour récupérer les jeux gratuits Epic ! ».
- **Annonce vocale** : déclencheur « Nouveau jeu gratuit disponible », condition « entre 9 h et
  22 h », puis faire dire à l'enceinte le titre du jeu.

## Dépannage

- **« L'Epic Games Store ne répond pas »** dans l'onglet Configuration : Gladys n'arrive pas à
  joindre la boutique (Internet, DNS, pare-feu). L'intégration réessaie après 5, 15, 30 puis 60
  minutes et garde en attendant les derniers jeux connus.
- **« L'Epic Games Store ne connaît pas ce pays »** : le code de pays est inconnu de la boutique.
  Utilisez un code ISO de deux lettres (`FR`, `BE`, `CH`, `CA`…).
- **Les valeurs n'apparaissent pas** : l'appareil doit avoir été ajouté depuis l'onglet
  Découverte ; les valeurs sont envoyées dès l'ajout.
- **Le déclencheur ne s'est pas lancé** : il ne se lance que pour un jeu qui _devient_ gratuit
  pendant que l'intégration tourne (voir plus haut).
- **Plus de détails** : ajoutez la variable d'environnement `LOG_LEVEL=debug` et consultez les
  journaux de l'intégration. En temps normal, elle n'écrit qu'au démarrage, à chaque nouveau jeu et
  en cas de problème.

## Limites

- L'intégration lit l'adresse publique que la page « Jeux gratuits » de la boutique utilise elle-même
  (`store-site-backend-static.ak.epicgames.com/freeGamesPromotions`). Elle n'est pas documentée par
  Epic, qui peut la changer sans prévenir.
- Elle la lit 6 à 8 fois par jour : toutes les 6 heures, puis 2 et 30 minutes après chaque
  changement d'offre. Epic ne publie aucun quota pour cette adresse, servie par un CDN ; ce rythme
  reste celui d'un visiteur.
- Seuls les jeux **gratuits** sont suivis, pas les promotions.
- La boutique ne dit pas si vous avez déjà récupéré un jeu : il faut un compte Epic pour cela, et
  l'intégration n'en utilise pas.
- Les jeux offerts sur l'application mobile Epic Games Store ne sont pas couverts.
