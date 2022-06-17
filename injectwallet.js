const Wallet = function () {
    const walletUrl = 'https://portal.tcoin.dev/wallet/#/inject'
    const walletOrigin = walletUrl.substring(0, walletUrl.indexOf('/', 8))
    var popup, currentPromise, currentRequest

    function randName() {
        return 'r' + Math.random().toString().substring(2)
    }

    function checkReset(msg) {
        if (typeof (popup) != 'undefined') {
            popup.close()
            const [_, reject] = currentPromise
            popup = undefined
            currentPromise = undefined
            currentRequest = undefined
            reject(new Error(msg || 'operation canceled by user'))
        }
    }

    window.addEventListener('message', (event) => {
        if (event.origin != walletOrigin) return
        if (event.data.target != 'tcoin-wallet') return
        if (typeof (popup) != 'undefined' && event.source.name != popup.name) return
        const data = event.data.data
        const method = data.method
        const arg = data.arg
        if (method == 'load') {
            popup.postMessage(currentRequest, walletOrigin)
            return
        }
        if (method == 'unload') {
            checkReset()
            return
        }
        if (method == 'error') {
            checkReset(arg)
            return
        }
        if (typeof (currentRequest) != 'undefined' && method == currentRequest.data.method) {
            const [resolve, _] = currentPromise
            popup.close()
            popup = undefined
            currentPromise = undefined
            currentRequest = undefined
            resolve(arg)
        }
    }, false)

    function sendRequest(method, arg) {
        checkReset()
        currentRequest = { target: 'tcoin-wallet', data: { method: method, arg: arg } }
        popup = window.open(walletUrl, '_blank', 'location,resizable,width=560,height=700')
        popup.name = randName()
        return new Promise((resolve, reject) => {
            currentPromise = [resolve, reject]
        })
    }

    return {
        connect: async function () {
            return await sendRequest('connect', '')
        },
        disconnect: async function () {
            return await sendRequest('disconnect', '')
        },
        approve: async function (tx) {
            return await sendRequest('approve', tx)
        }
    }
}

const WalletConnect = {
    template: `
    <span>
        <v-btn v-if="noconn" class="no-upper-case" outlined @click="connect"> Connect Wallet </v-btn>
        <v-btn v-else class="no-upper-case" outlined @click="disconnect"> Disconnect {{ addr.substring(0,10) + '...' + addr.substring(addr.length - 5) }} </v-btn>
    </span>
	`,
    data: function () {
        return {
            noconn: true,
            addr: '',
            wallet: Wallet(),
        }
    },
    methods: {
        connect: function () {
            this.wallet.connect().then(addr => {
                this.noconn = false
                this.addr = addr
                this.$emit('change', addr)
            }).catch(err => console.log(err))
        },
        disconnect: function () {
            this.wallet.disconnect().then(_ => {
                this.noconn = true
                this.addr = ''
                this.$emit('change', '')
            }).catch(err => console.log(err))
        },
        approve: async function (tx) {
            return await this.wallet.approve(tx)
        }
    }
}