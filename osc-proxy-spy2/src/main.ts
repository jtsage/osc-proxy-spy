import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'
import * as packJSON from '../package.json' with { type : 'json' }
import { MainLogger } from './lib/logger'
import { Settings } from './lib/settings'
import { UDPListenEvent, UDPListenFreqEvent } from './lib/connection'

const debug = !app.isPackaged && true

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if ( started ) {
	app.quit()
}

const log      = new MainLogger()
const settings = new Settings( log )

let mainWindow : BrowserWindow

const createWindow = () => {
	// Create the browser window.
	mainWindow = new BrowserWindow( {
		width          : 1050,
		height         : 650,
		webPreferences : {
			preload : path.join( __dirname, 'preload.js' ),
		},
	} )

	// and load the index.html of the app.
	if ( MAIN_WINDOW_VITE_DEV_SERVER_URL ) {
		mainWindow.loadURL( MAIN_WINDOW_VITE_DEV_SERVER_URL )
	} else {
		mainWindow.loadFile(
			path.join( __dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html` )
		)
	}

	if ( debug ) {
		mainWindow.webContents.openDevTools( { mode : 'detach' } )
	}
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on( 'ready', () => {
	createWindow()

	ipcMain.handle( 'log:all', () => log.all )
	ipcMain.handle( 'log:new', () => log.last )

	ipcMain.handle( 'settings:get', () => settings.save() )
	ipcMain.handle( 'settings:save', ( _, key : string, value ) => {
		switch ( key ) {
			case 'excludeConnection' :
				settings.excludeConnection = value
				break
			case 'excludeType' :
				settings.excludeType = value
				break
			case 'matchTerm' :
				settings.matchTerm = value
				break
			case 'modeAll' :
				settings.modeAll = value
				break
			default :
				break
		}
		return settings.save()
	} )

	settings.on( 'message',   ( v : UDPListenEvent )       => { safeSend( 'osc:data', v ) } )
	settings.on( 'frequency', ( v : UDPListenFreqEvent[] ) => { safeSend( 'osc:tick', v ) } )
} )

app.on( 'before-quit', () => { settings.saveToDisk() } )

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on( 'window-all-closed', () => {
	if ( process.platform !== 'darwin' ) {
		app.quit()
	}
} )

app.on( 'activate', () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if ( BrowserWindow.getAllWindows().length === 0 ) {
		createWindow()
	}
} )

app.setAboutPanelOptions( {
	applicationName    : 'OSC Proxy Spy',
	applicationVersion : packJSON.version,
	copyright          : 'Copyright © 2026',
} )


// MARK: Utility Functions
function safeSend( id : string, data : unknown ) {
	if ( mainWindow !== null && ! mainWindow.isDestroyed() ) {
		mainWindow.webContents.send( id, data )
	}
}

// MARK: app menu

const isMac = process.platform === 'darwin'
const mainMenu : Electron.MenuItemConstructorOptions[] = [
	// { role: 'fileMenu' }
	{
		label   : 'File',
		submenu : [
			isMac ? { role : 'close' } : { role : 'quit' }
		],
	},
	// { role: 'editMenu' }
	{
		label   : 'Edit',
		submenu : [
			{ role : 'undo' },
			{ role : 'redo' },
			{ type : 'separator' },
			{ role : 'cut' },
			{ role : 'copy' },
			{ role : 'paste' },
			{ role : 'delete' },
			{ type : 'separator' },
			{ role : 'selectAll' },
		],
	},
	// { role: 'viewMenu' }
	{
		label   : 'View',
		submenu : [
			{
				accelerator : 'CmdOrCtrl+1',
				click       : () => { safeSend( 'view', 'home' ) },
				label       : 'Show Messages',
			},
			{
				accelerator : 'CmdOrCtrl+2',
				click       : () => { safeSend( 'view', 'connect' ) },
				label       : 'Connections',
			},
			{
				accelerator : 'CmdOrCtrl+3',
				click       : () => { safeSend( 'view', 'log' ) },
				label       : 'Log',
			},
			{
				accelerator : 'CmdOrCtrl+4',
				click       : () => { safeSend( 'view', 'help' ) },
				label       : 'Help',
			},
			{ type : 'separator' },
			{ role : 'resetZoom' },
			{ role : 'zoomIn' },
			{ role : 'zoomOut' },
			{ type : 'separator' },
			{ role : 'togglefullscreen' } // cSpell:disable-line
		],
	},
	// { role: 'windowMenu' }
	{ role : 'window', submenu : [{ role : 'minimize' }, { role : 'close' }] },
	{
		role    : 'help',
		submenu : [
			{ role : 'about', label :  'About' },
			{
				label : 'Message Info',
				click : () => { safeSend( 'view', 'help' ) },
			},
			{
				label : 'GitHub',
				click : async() => { await shell.openExternal( 'https://github.com/jtsage/osc-proxy-spy' ) },
			},
		],
	}
]

if ( process.platform === 'darwin' ) {
	mainMenu.unshift( { role : 'appMenu' } )
}

if ( debug ) {
	mainMenu.push( {
		label   : 'Debug',
		submenu : [
			{ role : 'reload' },
			{ role : 'forceReload' },
			{ role : 'toggleDevTools' },
		],
	} )
}

const menu = Menu.buildFromTemplate( mainMenu )
Menu.setApplicationMenu( menu )
