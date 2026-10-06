# em cheyali bhaii

A calm, floating desktop to-do widget built with Electron and plain HTML, CSS, and JavaScript. The widget stays above other windows by default and includes controls to unpin, minimize, or close it.

## Run it

```powershell
npm install
npm start
```

Tasks are stored locally in Electron's application data folder. No account or internet connection is required after installation.

## Everyday use

- **Quick add from anywhere:** press Ctrl+Alt+N (Command+Shift+Space on a Mac). Type a task and press Enter; the widget folds back away. End with `today`, `tmrw` or a weekday (`fri`) to set the due date.
- **Reminders:** a notification at 8 AM for tasks due today, at 7 PM for tasks due tomorrow, and 3 hours before timed Canvas deadlines.
- **Week:** the week tab groups the next seven days by day; days with four or more tasks are marked.
- **Courses:** Canvas tasks show their course as a coloured chip; click it to see only that course.
- **Focus:** choose *Focus 25 min* from a task's ··· menu. The countdown shows in the widget and under the folder.
- The app starts with Windows and remembers where you left the folder.

## Google Tasks sync

Open em cheyali bhaii, select the **G** button, and follow the setup steps. Enable the Google Tasks API in Google Cloud, create an OAuth client with application type **Desktop app**, then paste its client ID (and client secret, if Google asks for one) into em cheyali bhaii. Sign-in uses OAuth 2.0 with PKCE and tokens are encrypted with the system keychain (Windows secure storage or macOS Keychain). em cheyali bhaii syncs the selected Google task list in both directions.

## Canvas

Select the **C** button and paste your Canvas calendar feed link (Canvas → Calendar → Calendar Feed). Assignments and events from the last two weeks onward appear in a Canvas list and refresh every 30 minutes. The import is read-only, and the feed link is encrypted with the system keychain (Windows secure storage or macOS Keychain). Deleting a Canvas task keeps it from coming back on the next refresh.

## Google Calendar

Select the **▦** button and paste your calendar's **Secret address in iCal format** (Google Calendar → Settings → your calendar → Integrate calendar). This works with school accounts that block app sign-in. Today's remaining classes and events appear above your tasks, and the week tab shows each day's events next to its tasks. Repeating events, skipped dates and moved or cancelled sessions are handled. The import is read-only and refreshes every 15 minutes; the secret address is encrypted on your computer. Keep it private: anyone with it can see your calendar.

## Build a Windows installer

```powershell
npm run dist
```

The installer will be created in the `dist` folder.

## Mac

On a Mac, install Node.js, then:

```bash
npm install
npm run dist:mac
```

Open the `.dmg` in `dist` and drag the app to Applications. The app is not signed, so the first time, right-click it and choose **Open**.
