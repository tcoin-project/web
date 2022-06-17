const api = axios.create({ baseURL: 'https://tcrpc2.mcfx.us/' });

const opts = { dark: false };
Vue.use(Vuetify);

Vue.component('wallet-connect', WalletConnect)

const Index = {
    template: `
    <v-col>
        <div style="display:inline-block;width:100%">
            <span style="float:left"><h2>TCoin Faucet</h2></span>
            <span style="float:right"><wallet-connect @change="changeWallet" ref="wallet"></wallet-connect></span>
        </div>
        <p>
            <v-btn class="no-upper-case" outlined @click="request"> Request for 1 TCoin </v-btn>
        </p>
    </v-col>
    `,
    data: function () {
        return {
            contract: 'tcoin2dA6ymZqfW6Df5FD78LQS2fNRaD5yP1iubw41qsCoWwKLQ',
            addr: '',
        }
    },
    computed: {
        intAmount: function () {
            return Math.floor(this.amount * 1000000000)
        }
    },
    methods: {
        changeWallet: function (addr) {
            this.addr = addr
        },
        request: function () {
            const code = codegen.genWorker('write', this.contract, 'request', 'i', 0, [])
            api.post('estimate_gas', { origin: this.addr, code: bytesToBase64(code) }).then(response => {
                if (response.data.error) {
                    alert(response.data.error)
                    return
                }
                this.$refs.wallet.approve({
                    type: 2,
                    toAddr: tcoin.nullAddr,
                    value: 0,
                    data: code,
                }).then(tx => {
                    tcoin.sendTransaction(tx)
                    alert('transaction sent')
                })
            })
        },
        unwrap: function () {
            const code = codegen.genWorker('write', this.wtcoin, 'burn', 'ii', 0, [this.intAmount])
            this.$refs.wallet.approve({
                type: 2,
                toAddr: tcoin.nullAddr,
                value: 0,
                data: code,
            }).then(tx => {
                tcoin.sendTransaction(tx)
            })
        },
        send: function () {
            const code = codegen.genWorker('write', this.wtcoin, 'transfer', 'iai', 0, [this.toAddr, this.intAmount])
            this.$refs.wallet.approve({
                type: 2,
                toAddr: tcoin.nullAddr,
                value: 0,
                data: code,
            }).then(tx => {
                tcoin.sendTransaction(tx)
            })
        }
    }
}

const router = new VueRouter({
    mode: 'hash',
    routes: [
        { path: '/', component: Index, name: 'index' },
    ]
})

new Vue({
    router,
    el: '#app',
    vuetify: new Vuetify(opts)
})