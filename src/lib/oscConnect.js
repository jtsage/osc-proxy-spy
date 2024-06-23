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

	sharedSocket = false
	proxySocket  = false
	outSocket    = false
	inSocket     = false

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

		this.#initConnection()
	}


	#emitOSC(buffer, _rinfo) {
		if ( typeof buffer === 'undefined' || buffer === null ) {
			this.emit('message', {
				address : null,
				args    : [],
				date    : (new Date()).toISOString(),
				name    : this.name,
				type    : 'osc-connection-open',
			} )
		} else {
			try {
				this.emit('message', {
					date : (new Date()).toISOString(),
					name : this.name,
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

	sendOut(buffer) {
		this.outSocket.send(buffer, 0, buffer.length, this.portOut, this.addressOut)
	}

	sendProxy(buffer, port, address) {
		this.proxySocket.send(buffer, 0, buffer.length, port, address)
	}

	safeClose() {
		if ( this.inSocket !== null ) { this.inSocket.close() }
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

			this.inSocket.on('message', (buffer) => { this.#emitOSC(buffer) } )
			this.inSocket.on('error',   (err) => {
				this.#emitError(err)
				this.inSocket.close()
			})
			this.inSocket.on('listening', () => { this.#emitOSC(null) })

			this.inSocket.bind(this.portIn, this.addressIn !== null ? this.addressIn : '0.0.0.0')
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
	}

}

module.exports.oscConnection = oscConnection