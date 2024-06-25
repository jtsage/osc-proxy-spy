const { app, BrowserWindow, ipcMain } = require('electron')

const path            = require('node:path')
const {oscConnection, getNetworkInterfaces} = require('./lib/oscConnect.js')
const {appState}      = require('./lib/settings.js')


// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { app.quit() }


const createWindow = () => {
	appState.win = new BrowserWindow({
		height : 600,
		width  : 950,

		titleBarOverlay : {
			color       : '#212529',
			symbolColor : '#5E6A75',
			height      : 25,
		},
		titleBarStyle   : 'hidden',

		webPreferences : {
			contextIsolation : true,
			nodeIntegration  : false,
			preload          : path.join(appState.RENDER, 'preload.js'),
		},
	})

	// and load the index.html of the app.
	appState.win.loadFile(path.join(appState.RENDER, 'index.html'))

	// Open the DevTools.
	if ( appState.debug ) {	appState.win.webContents.openDevTools() }

	appState.win.webContents.on('did-finish-load', () => {
		appState.win.webContents.send('settings:networks', getNetworkInterfaces())
	})
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
	ipcMain.handle('i18n:string', (e, t) => appState.i18n.eventString(e, t))

	createWindow()

	const testOSCCon = new oscConnection({
		name : 'test-connect',
		portIn : 3333,
		portOut : 3366,
		// proxyPairs : [
		// 	{ port : 4444, address : '127.0.0.1' },
		// 	{ port : 4400, address : '127.0.0.1' },
		// ],
	})

	testOSCCon.on('message', (msg) => {
		appState.win.webContents.send('osc:data', msg)
	})
	
	testOSCCon.on('frequency', (time, since) => {
		appState.win.webContents.send('osc:tick', time, since, testOSCCon.name)
	})

	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		}
	})
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') { app.quit() }
})
