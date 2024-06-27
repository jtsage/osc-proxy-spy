/*                   ____                      ____              
 *     ___  ___  ___|  _ \ _ __ _____  ___   _/ ___| _ __  _   _ 
 *    / _ \/ __|/ __| |_) | '__/ _ \ \/ / | | \___ \| '_ \| | | |
 *   | (_) \__ \ (__|  __/| | | (_) >  <| |_| |___) | |_) | |_| |
 *    \___/|___/\___|_|   |_|  \___/_/\_\\__, |____/| .__/ \__, |
 *                                       |___/      |_|    |___/ 
 * (c) 2024 JTSage <https://github.com/jtsage/osc-proxy-spy> */

const EventEmitter = require('node:events')
const dgram        = require('node:dgram')
const osc          = require('simple-osc-lib')

class oscConnection extends EventEmitter {
	addressIn  = null
	addressOut = null
	name       = null
	portIn     = null
	portOut    = null
	proxy      = false
	proxyPairs = []

	proxyIn         = false
	proxyInAddress  = null
	proxyInPort     = null

	sharedSocket  = false
	proxySocket   = null
	inProxySocket = null
	outSocket     = null
	inSocket      = null

	frequencyInterval = null
	lastSix           = [0, 0, 0, 0, 0, 0]


	oscLib = null

	constructor(options) {
		super()

		this.name    = options?.name ?? 'un-named'
		this.portIn  = options?.portIn ?? null
		this.portOut = options?.portOut ?? null

		this.proxyPairs = options?.proxyPairs ?? []
		if ( this.proxyPairs.length !== 0 && this.portIn !== null ) { this.proxy = true }

		this.addressIn  = options?.addressIn ?? '0.0.0.0'
		this.addressOut = options?.addressOut ?? '127.0.0.1'
		
		this.sharedSocket = options?.sharedSocket ?? false

		this.proxyInAddress = options?.proxyInAddress ?? null
		this.proxyInPort    = options?.proxyInPort ?? null

		if ( this.proxyInPort !== null && this.proxyInAddress !== null && this.portOut !== null ) {
			this.proxyIn = true
		}

		this.#initConnection()
	}


	safeClose() {
		if ( this.inProxySocket !== null ) { this.inProxySocket.close() }
		if ( this.inSocket !== null ) { this.inSocket.close() }
	}

	#emitOSC(buffer, isInputProxy = false) {
		if ( typeof buffer === 'undefined' || buffer === null ) {
			this.emit('message', {
				address : null,
				args    : [],
				date    : (new Date()).toISOString(),
				name    : this.name,
				proxyIn : isInputProxy,
				type    : 'osc-connection-open',
			} )
		} else {
			try {
				const thisDate = new Date()
				this.lastSix.shift()
				this.lastSix.push(thisDate.getTime())
				this.emit('message', {
					date    : thisDate.toISOString(),
					name    : this.name,
					proxyIn : isInputProxy,
					...this.oscLib.readPacket(buffer),
				})
			} catch (err) {
				this.#emitError(err)
			}
		}
	}

	#emitError(err) {
		this.emit('error', err)
	}

	#getReceiveFrequency() {
		let avgDivisor = 0
		let avgDividend = 0
		for ( let i = 0; i < this.lastSix.length -1; i++ ) {
			if ( this.lastSix[i] === 0 ) { continue }
			avgDividend+= this.lastSix[i+1] - this.lastSix[i]
			avgDivisor++
		}

		this.emit(
			'frequency',
			( avgDivisor === 0 ) ? 0 : 1000 / Math.round(avgDividend / avgDivisor),
			( this.lastSix[this.lastSix.length - 1] === 0 ) ? 11000 : (new Date()).getTime() - this.lastSix[this.lastSix.length - 1]
		)
	}

	sendOut(buffer) {
		this.outSocket.send(buffer, 0, buffer.length, this.portOut, this.addressOut)
	}

	sendProxy(buffer, port, address) {
		this.proxySocket.send(buffer, 0, buffer.length, port, address)
	}

	#initConnection() {
		if ( this.portIn === null && this.portOut === null ) {
			throw new SyntaxError('connection does nothing')
		}

		if ( this.sharedSocket && ( this.portIn === null || this.portOut === null || this.addressOut === '127.0.0.1' )) {
			throw new SyntaxError('invalid shared socket configuration')
		}

		this.oscLib = new osc.simpleOscLib()

		if ( this.portIn !== null ) {
			this.inSocket = dgram.createSocket({type : 'udp4', reuseAddr : true})

			this.inSocket.on('message', (buffer) => {
				this.#emitOSC(buffer)
			})
			this.inSocket.on('error',   (err) => {
				this.#emitError(err)
				this.inSocket.close()
			})
			this.inSocket.on('listening', () => { this.#emitOSC(null) })

			this.inSocket.bind(this.portIn, this.addressIn !== null ? this.addressIn : '0.0.0.0')

			setInterval(() => { this.#getReceiveFrequency() }, 1000)
		}

		if ( this.portOut !== null ) {
			if ( this.sharedSocket ) {
				this.outSocket = this.inSocket
			} else {
				this.outSocket = dgram.createSocket({type : 'udp4', reuseAddr : true})
			}
		}

		if ( this.proxy ) {
			this.proxySocket = dgram.createSocket({type : 'udp4', reuseAddr : true})
			this.inSocket.on('message', (buffer) => {
				for ( const thisProxy of this.proxyPairs ) {
					this.sendProxy(buffer, thisProxy.port, thisProxy.address)
				}
			})
		}

		if ( this.proxyIn ) {
			this.inProxySocket = dgram.createSocket({type : 'udp4', reuseAddr : true})
			this.inProxySocket.bind(this.proxyInPort, this.proxyInAddress)
			this.inProxySocket.on('message', (buffer) => {
				this.sendOut(buffer)
				this.#emitOSC(buffer, true)
			})
			this.inProxySocket.on('error',   (err) => {
				this.#emitError(err)
				this.inSocket.close()
			})
			this.inProxySocket.on('listening', () => { this.#emitOSC(null, true) })
		}
	}

}

function getNetworkInterfaces() {
	const validNetworks = new Set(['0.0.0.0'])

	for ( const iface of Object.values(require('node:os').networkInterfaces()) ) {
		for ( const address of iface ) {
			if ( address.family === 'IPv4' ) { validNetworks.add(address.address) }
		}
	}

	return [...validNetworks].sort()
}

module.exports = {
	getNetworkInterfaces : getNetworkInterfaces,
	oscConnection        : oscConnection,
}