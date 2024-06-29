/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

const { app, BrowserWindow, ipcMain, Menu } = require('electron')
const path                                  = require('node:path')
const {oscConnection, getNetworkInterfaces} = require('./lib/oscConnect.js')
const {appState, getMenu}                   = require('./lib/settings.js')

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { app.quit() }

const createWindow = () => {
	appState.win = new BrowserWindow({
		height : 600,
		width  : 950,

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
			try {
				appState.win.webContents.send('osc:data', msg)
			} catch {
				/* do nothing */
			}
		})
		
		appState.oscConnections[i].on('frequency', (time, since, working) => {
			try {
				appState.win.webContents.send('osc:tick', time, since, working, appState.oscConnections[i].name)
			} catch {
				/* do nothing */
			}
		})
	}
}


app.whenReady().then(() => {
	ipcMain.handle('i18n:string', (e, text) => appState.i18n.eventString(e, text))
	ipcMain.handle('settings:networks', () => getNetworkInterfaces())
	ipcMain.handle('settings:reopen:connections', () => { openConnections() })
	ipcMain.handle('settings:write:connection', (_e, connection) => {
		const saveState = appState.settings.saveConnection(connection)
		openConnections()
		return saveState
	})
	ipcMain.handle('settings:read:connection', (_e, number) => appState.settings.getConnection(number))
	ipcMain.handle('settings:get', (_e, settingName) => appState.settings.get(settingName) )
	ipcMain.handle('settings:set', (_e, settingName, value) => appState.settings.set(settingName, value))
	ipcMain.handle('settings:toggle', (_e, settingName, forceValue = null) => appState.settings.toggle(settingName, forceValue))
	ipcMain.handle('osc:send', (_e, connection, packet) => {
		try {
			appState.oscConnections[connection].sendObjectOut(packet)
			return true
		} catch {
			return false
		}
	})

	createWindow()
	openConnections()

	const menu = Menu.buildFromTemplate(getMenu())
	Menu.setApplicationMenu(menu)

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		}
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') { app.quit() }
})
