/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) JTSage <https://github.com/jtsage/osc-proxy-spy> */

// @ts-expect-error no types
import './scss/styles.scss'
// import * as bootstrap from 'bootstrap'
import * as util from './util'

import { IpcType } from '../preload'
import { UDPListenEvent, UDPListenFreqEvent } from 'src/lib/connection'
import { SettingsDef } from 'src/lib/settings'
declare global { interface Window { ipc : IpcType } }

let currentSettings : SettingsDef

window.ipc.receive( 'view', ( id : string ) => {
	const tabs    = document.querySelectorAll( '.page-tab-pane' )
	const thisTab = util.getId( `${id}-tab-pane` ) ?? util.getId( 'home-tab-pane' )

	for ( const element of tabs ) { element.classList.add( 'd-none' ) }
	util.safeClassRem( thisTab, 'd-none' )
	if ( id === 'log' ) {
		newLog()
	}
} )

window.ipc.receive( 'osc:data', ( data : UDPListenEvent ) => {
	if ( !currentSettings.modeAll ) {
		util.buildUDPListenEvent( data )
	} else {
		util.replaceUDPListenEvent( data )
	}
} )

window.ipc.receive( 'osc:tick', ( data : UDPListenFreqEvent[] ) => { for ( const item of data ) { util.freqEntry( item ) } } )

document.addEventListener( 'DOMContentLoaded', () => {
	window.ipc.getSettings().then( ( result ) => { currentSettings = result } )
	setInterval( () => {
		const logTab = util.getId( 'log-tab-pane' )
		if ( logTab !== null && logTab.checkVisibility() ) {
			updateLog()
		}
	}, 1000 )
} )

const updateLog = () => {
	window.ipc.getLogNew().then( ( result ) => {
		const logCon = util.getId( 'log-container' )
		for ( const item of result ) {
			const thisDiv = document.createElement( 'div' )
			thisDiv.classList.add( 'data-osc' )
			thisDiv.innerHTML = [
				util.OSCDisplayParts.timeStamp( ( new Date( item[0] ).toLocaleString() ) ),
				util.OSCDisplayParts.address( item[1] ),
				util.OSCDisplayParts.connection( item[2] ),
				util.OSCDisplayParts.arg( { type : 'string', value : item[3] } ),
			].join( '' )
			if ( logCon !== null ) {
				logCon.appendChild( thisDiv )
			}
		}
	} )
}

const newLog = () => {
	window.ipc.getLogAll().then( ( result ) => {
		const resultHTML = result.map( ( item : string[] ) => {
			return [
				'<div class="data-osc">',
				util.OSCDisplayParts.timeStamp( ( new Date( item[0] ).toLocaleString() ) ),
				util.OSCDisplayParts.address( item[1] ),
				util.OSCDisplayParts.connection( item[2] ),
				util.OSCDisplayParts.arg( { type : 'string', value : item[3] } ),
				'</div>'
			].join( '' )
		} )
		util.setInnerHTML( 'log-container', resultHTML.join( '\n' ) )
	} )
}
