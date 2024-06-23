/*  _______           __ _______               __         __   
   |   |   |.-----.--|  |   _   |.-----.-----.|__|.-----.|  |_ 
   |       ||  _  |  _  |       ||__ --|__ --||  ||__ --||   _|
   |__|_|__||_____|_____|___|___||_____|_____||__||_____||____|
   (c) 2022-present FSG Modding.  MIT License. */

// Main window preLoad

const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld(
	'i18n', {
		string : (key) => ipcRenderer.invoke('i18n:string', key),

		// getLocale        : () => { return ipcRenderer.sendSync('toMain_getText_locale') },
		// getText_send     : ( items )  => { ipcRenderer.send('toMain_getText_send', items) },
		// getText_sync     : ( items ) => { return ipcRenderer.sendSync('toMain_getText_sync', items) },
		// receive          : ( channel, func ) => {
		// 	const validChannels = new Set([
		// 		'fromMain_getText_return',
		// 		'fromMain_l10n_refresh'
		// 	])
		
		// 	if ( validChannels.has( channel ) ) {
		// 		ipcRenderer.on( channel, ( _, ...args ) => func( ...args ))
		// 	}
		// },
	}
)


contextBridge.exposeInMainWorld(
	'osc', {
		copyFavorites   : () => { ipcRenderer.send('toMain_copyFavorites') },
		
		receive   : ( channel, func ) => {
			const validChannels = new Set([
				'osc-data',
			])
		
			if ( validChannels.has( channel ) ) {
				ipcRenderer.on( channel, ( _, ...args ) => func( ...args ))
			}
		},
	}
)