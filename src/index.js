const { app, BrowserWindow, ipcMain } = require('electron')

const path   = require('node:path')
const RENDER = path.join(__dirname, 'render')
const {oscConnection} = require('./lib/oscConnect.js')
let mainWindow = null

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
	app.quit()
}

const appState = {
	lang : 'en-US',
}

const translateString = (_event, text) => {
	if ( appState.lang === 'en-US' ) {
		return `~${text}~`
	}
	// check if key exists in new lang, return english otherwise
	return 'unimplemented'
}

const createWindow = () => {
	mainWindow = new BrowserWindow({
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
			preload          : path.join(RENDER, 'preload.js'),
		},
	})

	// and load the index.html of the app.
	mainWindow.loadFile(path.join(RENDER, 'index.html'))

	// Open the DevTools.
	mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
	ipcMain.handle('i18n:string', translateString)

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
		mainWindow.webContents.send('osc-data', msg) })

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
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
