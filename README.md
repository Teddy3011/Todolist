# em cheyali bhaii

A calm, floating desktop to-do widget built with Electron and plain HTML, CSS, and JavaScript. The widget stays above other windows by default and includes controls to unpin, minimize, or close it.

## Run it

```powershell
npm install
npm start
```

Tasks are stored locally in Electron's application data folder. No account or internet connection is required after installation.

## Google Tasks sync

Open em cheyali bhaii, select the **G** button, and follow the setup steps. Enable the Google Tasks API in Google Cloud, create an OAuth client with application type **Desktop app**, then paste its client ID into em cheyali bhaii. Sign-in uses OAuth 2.0 with PKCE and tokens are encrypted using Windows secure storage. em cheyali bhaii syncs the selected Google task list in both directions.

## Canvas

Select the **C** button and paste your Canvas calendar feed link (Canvas → Calendar → Calendar Feed). Assignments and events from the last two weeks onward appear in a Canvas list and refresh every 30 minutes. The import is read-only, and the feed link is encrypted using Windows secure storage. Deleting a Canvas task keeps it from coming back on the next refresh.

## Build a Windows installer

```powershell
npm run dist
```

The installer will be created in the `dist` folder.
