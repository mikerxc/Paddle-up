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
| Hidden skill | Kept on the phone, from **2.0 to 5.5**. Only a host edit changes it. Numbers stay off Players until PIN **000** unlocks them, and Lock or a refresh hides them again. |
| Courts | **2** (switch to 1 in one tap; 3–8 are available) |
| Game | First to **11**, **win by 2**, no cap. A final score stops on the exact winning total: **11–9** and **13–11** count; **15–5** and **12–5** do not |

Chosen so nothing is hard-coded in silence:

| Setting | Default |
| --- | --- |
| Starting hidden skill for a new player | **3.0** |
| Rounds planned at the start | **4**. Finishing a round tops the upcoming list back up to **8**. **Add round** adds one more with no cap |
| Sound when a round is ready | **On** |
| Vibration when a round is ready (`navigator.vibrate` where the phone allows it) | **On** |
| Points-to-win and win-by | Editable in Settings, starting at 11 and 2 |
| Host skill controls | **Off**. Enter PIN **000** in Settings to view or set a hidden skill. **Lock** hides the numbers again. |
| Undo history | **50** compact steps for the open round. The button is greyed once the next round starts, and it does not undo that boundary. |
| Past sessions kept | **40** |
| Highest score the keypad accepts | **99** (a sanity limit, not a game cap) |
| Team floor | Each team's ratings, rounded to 0.1, must add up to at least **5.0** when that is possible |

## How a session works

1. Add players once (name, and a hidden rating if host controls are unlocked). They stay in Players.
2. Open Setup Games, tap who's playing, choose the courts, and start.
3. The engine fills the courts with balanced teams. Extra people sit this round; the next rounds spread those sits.
4. Tap a name to sub, trade, or mark them out. **Undo** walks those taps back.
5. Enter scores with +/− or the number pad. Finish the round only when every winner has exactly the ending score: 11, or the other score plus 2 once the game is past 11.
6. **Reshuffle** remixes every unscored court, the bench, and the later rounds. A court that already has points stays as it is. A second reshuffle will not bring back a lineup you already saw.
7. **Add round** puts one more round at the end. Finishing a round keeps up to eight rounds planned ahead. The session continues until you end it.
8. End the session for wins, losses, games played, and point margin. **Copy recap** puts that summary on the clipboard. The log and the result stay in past sessions.

Pairing uses ratings only. Each team total has to reach 5.0 when the players on court allow it (2.0 with 3.0 is fine, 2.0 with 2.0 is not). If that is impossible, the round still plays and that court is flagged. Who sits follows games played and sit-outs first; ties use the session salt and prefer a bench that leaves 5.0 teams possible. Partners and opponents both rotate, with partner repeats weighed more heavily, and the same partnership does not repeat from the previous round when another lineup exists. Someone coming back from a sit is paired with someone who stayed on when that is possible. Someone added mid-session joins the normal rotation, even with the group. They do not skip the line, and they are not charged sits for the rounds they missed.

Settings can export a JSON backup (players, hidden skill history, settings, and past sessions) and restore it after a confirmation.
