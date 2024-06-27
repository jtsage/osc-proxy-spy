/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

const { app, BrowserWindow, ipcMain }       = require('electron')
const path                                  = require('node:path')
const {oscConnection, getNetworkInterfaces} = require('./lib/oscConnect.js')
const {appState}                            = require('./lib/settings.js')

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

	// appState.win.webContents.on('did-finish-load', () => {
	// 	appState.win.webContents.send('settings:networks', getNetworkInterfaces())
	// })
}

const openConnections = () => {
	for ( let i = 1; i <= 8; i++ ) {
		if ( appState.oscConnections[i] !== null ) {
			appState.oscConnections[i].safeClose()
			appState.oscConnections[i] = null
		}
		const thisConnection = appState.settings.getConnection(i)
		if ( thisConnection.isActive === false ) { continue }
		appState.oscConnections[i] = new oscConnection(thisConnection)

		appState.oscConnections[i].on('message', (msg) => {
			appState.win.webContents.send('osc:data', msg)
		})
		
		appState.oscConnections[i].on('frequency', (time, since) => {
			appState.win.webContents.send('osc:tick', time, since, appState.oscConnections[i].name)
		})
		// console.log(thisConnection)
	}
}

app.whenReady().then(() => {
	ipcMain.handle('i18n:string', (e, text) => appState.i18n.eventString(e, text))
	ipcMain.handle('settings:networks', () => getNetworkInterfaces())
	ipcMain.handle('settings:write:connection', (_e, connection) => {
		const saveState = appState.settings.saveConnection(connection)
		openConnections()
		return saveState
	})
	ipcMain.handle('settings:read:connection', (_e, number) => appState.settings.getConnection(number))

	createWindow()
	openConnections()

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
