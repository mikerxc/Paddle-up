# Paddle Up

Phone-first scoreboard for pickleball open play. One person holds the phone: check in whoever showed up, let the app pair doubles, tap in the scores, and read the night's results. There is no account and no server. The roster, the live session, and past nights stay in the browser.

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
| Skill scale | DUPR-style **2.0 to 5.5**, steps of **0.1** |
| Courts | **2** (switch to 1 in one tap; 3–8 are available) |
| Game | First to **11**, **win by 2**, no cap. A final score stops on the exact winning total: **11–9** and **13–11** count; **15–5** and **12–5** do not |

Chosen so nothing is hard-coded in silence:

| Setting | Default |
| --- | --- |
| Skill on the new-player form | **2.0** |
| Rounds planned at the start | **4**. **Next round** keeps the night going after those, until you end it |
| Sound when a round is ready | **On** |
| Vibration when a round is ready (`navigator.vibrate` where the phone allows it) | **On** |
| Points-to-win and win-by | Editable in House rules, starting at 11 and 2 |
| Undo history | **50** changes, including after a refresh |
| Past sessions kept | **40** |
| Highest score the keypad accepts | **99** (a sanity limit, not a game cap) |
| Gender choices | **Female** and **Male** |

## How a night works

1. Add players once (name, gender, skill). They stay on the roster.
2. Tap who's here and how many courts you have, then start.
3. The engine fills the courts. Extra people sit this round; the next rounds spread those sits.
4. Tap a name to sub, trade, or mark them out. **Undo** walks those taps back.
5. Enter scores with +/− or the number pad. Finish the round only when every winner has exactly the ending score: 11, or the other score plus 2 once the game is past 11.
6. When the planned rounds are done, tap **Next round**. The night continues, rebalanced, until you end it.
7. End the session for wins, losses, and point margin. The log and the result stay in past sessions.

Pairing avoids two women against two men whenever any other lineup exists. Mixed-versus-mixed and same-gender-versus-same-gender are both preferred, and team skill totals stay close. Partners and opponents rotate. Someone who arrives mid-session joins the normal rotation, even with the group. They do not skip the line, and they are not charged sits for the rounds they missed.
