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

	appState.win.webContents.on('did-finish-load', () => {
		for ( const oldLogItem of appState.log.getAll() ) {
			appState.win.webContents.send('osc:log', ...oldLogItem)
		}
		openConnections()
	})

	// Open the DevTools.
	if ( appState.debug ) {	appState.win.webContents.openDevTools() }

}

const openConnection = (i) => {
	if ( appState.oscConnections[i] !== null ) {
		appState.log.addGood(`Connection #${i} :: CLOSING`)
		try {
			appState.oscConnections[i].removeAllListeners()
			appState.oscConnections[i].safeClose()
		} catch (err) {
			appState.log.addError(`Connection #${i} :: ${err.message}`)
		}
		appState.oscConnections[i] = null
	}
	const thisConnection = appState.settings.getConnection(i)

	if ( thisConnection.isActive === false ) {
		appState.log.addGood(`Connection #${i} :: SKIPPING INACTIVE`)
		return true
	}

	appState.log.addGood(`Connection #${i} :: OPENING`)

	try {
		appState.oscConnections[i] = new oscConnection(thisConnection)

		appState.oscConnections[i].on('message', (msg) => {
			try {
				appState.win.webContents.send('osc:data', msg)
			} catch (err) {
				appState.log.addError(`Connection #${i} :: ${err.message}`)
			}
		})
		
		appState.oscConnections[i].on('frequency', (time, since, working) => {
			try {
				appState.win.webContents.send('osc:tick', time, since, working, appState.oscConnections[i].name)
			} catch (err) {
				appState.log.addError(`Connection #${i} :: ${err.message}`)
			}
		})

		appState.oscConnections[i].on('error', (message) => {
			appState.log.addError(`Connection #${i} :: ${message}`)
		})
		appState.oscConnections[i].on('log', (message) => {
			appState.log.addGood(`Connection #${i} :: ${message}`)
		})

		appState.oscConnections[i].init()

	} catch (err) {
		appState.settings.inactivateConnection(i)
		appState.log.addError(`Connection #${i} :: ${err.message}`)
		return false
	}
	return true
}

const openConnections = () => {
	let thisStatus = true
	for ( let i = 1; i <= 8; i++ ) {
		if ( ! openConnection(i) ) {
			thisStatus = false
		}
	}
	return thisStatus
}

const saveConnection = (_e, details) => {
	const saveState = appState.settings.saveConnection(details)
	return saveState && openConnection(details.number)
}

const sendOSCMessage = (_e, connection, packet) => {
	try {
		appState.oscConnections[connection].sendObjectOut(packet)
		return true
	} catch (err) {
		appState.log.addError(`CONNECTION #${connection} :: Send Failed : ${err.message}`)
		return false
	}
}

const updateMenu = () => {
	const menu = Menu.buildFromTemplate(getMenu())
	Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
	ipcMain.handle('i18n:string', (e, text) => appState.i18n.eventString(e, text))
	ipcMain.handle('i18n:getLangList', () => ({ active : appState.settings.get('langCode'), list   : appState.i18n.langKeyList }))
	ipcMain.handle('i18n:set', (_e, value) => { appState.settings.set('langCode', value); updateMenu() })

	ipcMain.handle('settings:networks', getNetworkInterfaces)
	ipcMain.handle('settings:reopen:connections', openConnections )
	ipcMain.handle('settings:write:connection', saveConnection)
	ipcMain.handle('settings:read:connection', (_e, number) => appState.settings.getConnection(number))

	ipcMain.handle('settings:get', (_e, settingName) => appState.settings.get(settingName) )
	ipcMain.handle('settings:isDebug', () => appState.debug )
	ipcMain.handle('settings:set', (_e, settingName, value) => appState.settings.set(settingName, value))
	ipcMain.handle('settings:toggle', (_e, settingName, forceValue = null) => appState.settings.toggle(settingName, forceValue))
	ipcMain.handle('settings:dumpTranslationMemory', () => { if ( appState.debug ) { appState.i18n.saveToDisk() } })

	ipcMain.handle('osc:send', sendOSCMessage)

	createWindow()
	updateMenu()

	appState.log.on('new', (thisStatus, date, text) => {
		appState.win.webContents.send('osc:log', thisStatus, date, text)
	})

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow()
		}
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') { app.quit() }
})
