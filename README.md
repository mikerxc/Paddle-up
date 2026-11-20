# Paddle Up

Phone-first scoreboard for pickleball open play. One person holds the phone: set up the games, let the app build fair doubles, tap in the scores, and read the session's results. There is no account and no server. Players, the live session, and past sessions stay in the browser.

## Run it locally

```bash
npm install
npm test
npm run dev
```

Open the URL Vite prints (it uses port **43123**). On a phone, use the same Wi-Fi and the network address Vite shows.

`npm run build` writes a static site to `dist/`. `npm run preview` serves that folder.

## Deploy to GitHub Pages

The production build uses relative asset paths (`base: './'`), so the same `dist/` folder works at `https://<user>.github.io/<repo>/` without baking the repository name into the app.

1. Push this repo to GitHub.
2. In the repo, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main`. The workflow in `.github/workflows/pages.yml` runs the tests, builds `dist/`, and deploys it.

`public/.nojekyll` is copied into the build so a branch-based Pages setup will not drop files. The Actions workflow is the path to use.

## Defaults

Confirmed with the group:

| Setting | Default |
| --- | --- |
| Hidden skill | Kept on the phone, from **2.0 to 5.5**. Finished games nudge it from wins and point margin. It stays off every screen unless Host skill controls are on in Settings. Those controls sit behind host PIN **000**, and they lock again when Settings is closed. |
| Courts | **2** (switch to 1 in one tap; 3–8 are available) |
| Game | First to **11**, **win by 2**, no cap. A final score stops on the exact winning total: **11–9** and **13–11** count; **15–5** and **12–5** do not |

Chosen so nothing is hard-coded in silence:

| Setting | Default |
| --- | --- |
| Starting hidden skill for a new player | **2.0** |
| Rounds planned at the start | **4**. **Next round** keeps the session going after those, until you end it |
| Sound when a round is ready | **On** |
| Vibration when a round is ready (`navigator.vibrate` where the phone allows it) | **On** |
| Points-to-win and win-by | Editable in Settings, starting at 11 and 2 |
| Host skill controls | **Off**. Enter PIN **000** in Settings to view or set a hidden skill. Leaving Settings locks them again. |
| Undo history | **50** changes, including after a refresh. The number on Undo counts edits in the open round only, and it returns to zero when the next round starts. Undo can still step back across that boundary. |
| Past sessions kept | **40** |
| Highest score the keypad accepts | **99** (a sanity limit, not a game cap) |
| Gender choices | **Female** and **Male** |

## How a session works

1. Add players once (name and gender). They stay in Players.
2. Open Setup Games, tap who's playing, choose the courts, and start.
3. The engine fills the courts with balanced teams. Extra people sit this round; the next rounds spread those sits.
4. Tap a name to sub, trade, or mark them out. **Undo** walks those taps back.
5. Enter scores with +/− or the number pad. Finish the round only when every winner has exactly the ending score: 11, or the other score plus 2 once the game is past 11.
6. **Reshuffle** re-rolls the open round and the rounds after it. If the current round already has points, only the later rounds change.
7. When the planned rounds are done, tap **Next round**. The session continues, rebalanced, until you end it.
8. End the session for wins, losses, games played, and point margin. **Copy recap** puts that summary on the clipboard. The log and the result stay in past sessions.

Pairing avoids two women against two men whenever any other lineup exists, and it does not put the two lowest hidden skills against the two highest. The lowest-rated players in the round are also kept off the same team when another fair lineup exists, including when they would otherwise fill a court by themselves. Partner counts are treated as a hard preference after those protections: a repeat loses to a lineup that spreads partners, even when the teams are a bit less even. The same partnership does not repeat from the previous round when any other lineup exists, and someone returning from a sit is paired with someone who stayed on when that is possible. Mixed-versus-mixed and same-gender-versus-same-gender are both preferred. Someone added mid-session joins the normal rotation, even with the group. They do not skip the line, and they are not charged sits for the rounds they missed.

Settings can export a JSON backup (players, hidden skill history, settings, and past sessions) and restore it after a confirmation.
