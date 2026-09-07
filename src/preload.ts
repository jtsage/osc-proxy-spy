/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

import { contextBridge, ipcRenderer } from 'electron'
import { ConnectionDef } from './lib/connection'

const ipc = {
	getLogAll : () => ipcRenderer.invoke( 'log:all' ),
	getLogNew : () => ipcRenderer.invoke( 'log:new' ),

	changeSetting : ( id : string, value : unknown ) => ipcRenderer.invoke( 'settings:save', id, value ),
	discover      : () => ipcRenderer.invoke( 'connect:find' ),
	doSend        : () => ipcRenderer.invoke( 'connect:send' ),
	getSettings   : () => ipcRenderer.invoke( 'settings:get' ),
	networks      : () => ipcRenderer.invoke( 'connect:networks' ),
	removeCon     : ( index : number ) => ipcRenderer.invoke( 'connect:remove', index ),
	saveCon       : ( index : number, data : ConnectionDef ) => ipcRenderer.invoke( 'connect:save', index, data ),
	
	// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
	receive   : ( channel : string, func : Function ) => {
		const validChannels = new Set( [
			'view',
			'osc:data',
			'osc:tick',
		] )
	
		if ( validChannels.has( channel ) ) {
			ipcRenderer.on( channel, ( _, ...args ) => func( ...args ) )
		}
	},
}

contextBridge.exposeInMainWorld( 'ipc', ipc )
export type IpcType = typeof ipc