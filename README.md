# Daymark

A calm, floating desktop to-do widget built with Electron and plain HTML, CSS, and JavaScript. The widget stays above other windows by default and includes controls to unpin, minimize, or close it.

## Run it

```powershell
npm install
npm start
```

Tasks are stored locally in Electron's application data folder. No account or internet connection is required after installation.

## Google Tasks sync

Open Daymark, select the **G** button, and follow the setup steps. Enable the Google Tasks API in Google Cloud, create an OAuth client with application type **Desktop app**, then paste its client ID into Daymark. Sign-in uses OAuth 2.0 with PKCE and tokens are encrypted using Windows secure storage. Daymark syncs the selected Google task list in both directions.

## Build a Windows installer

```powershell
npm run dist
```

The installer will be created in the `dist` folder.
