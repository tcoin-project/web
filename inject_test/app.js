const api = axios.create({ baseURL: 'https://tcrpc2.mcfx.us/' });

const opts = { dark: false };
Vue.use(Vuetify);

Vue.component('wallet-connect', WalletConnect)

const Index = {
    template: `
    <v-col>
        <div style="display:inline-block;width:100%">
            <span style="float:left"><h2>Wrapped TCoin</h2></span>
            <span style="float:right"><wallet-connect @change="changeWallet" ref="wallet"></wallet-connect></span>
        </div>
        <p> Wallet Balance: {{ tcoin.utils.showCoin(balance) }} TCoin </p>
        <p> Wrapped Balance: {{ tcoin.utils.showCoin(wbalance) }} WTCoin </p>
        <v-text-field v-model="toAddr" label="Recipient address"></v-text-field>
        <v-text-field v-model="amount" label="Amount" suffix="TCoin"></v-text-field>
        <p>
            <v-btn class="no-upper-case" outlined @click="wrap"> Wrap </v-btn>
            <v-btn class="no-upper-case" outlined @click="unwrap"> Unwrap </v-btn>
            <v-btn class="no-upper-case" outlined @click="send"> Send </v-btn>
        </p>
    </v-col>
    `,
    data: function () {
        return {
            wtcoin: 'tcoin2te7Jd2FURuw8VR96gdZd2qbCerSSUb7dnLAPAyS7sGLDM',
            addr: '',
            toAddr: '',
            balance: 0,
            wbalance: 0,
            amount: 0,
        }
    },
    computed: {
        intAmount: function () {
            return Math.floor(this.amount * 1000000000)
        }
    },
    created: function () {
        this.update(true)
    },
    methods: {
        changeWallet: function (addr) {
            this.addr = addr
            this.update(false)
        },
        update: function (setnxt = true) {
            if (this.addr == '') {
                this.balance = 0
                this.wbalance = 0
                if (setnxt) setTimeout(this.update, 3000)
                return
            }
            tcoin.getBalance(this.addr).then(balance => {
                this.balance = balance
                if (setnxt) setTimeout(this.update, 3000)
            })
            const code = codegen.genWorker('read', this.wtcoin, 'balanceOf', 'ia', 0, [this.addr])
            tcoin.runViewCode(this.addr, code).then(res => {
                this.wbalance = codegen.parseResult('i', res.data)
            })
        },
        wrap: function () {
            const code = codegen.genWorker('write', this.wtcoin, 'mint', 'i', this.intAmount, [])
            this.$refs.wallet.approve({
                type: 2,
                toAddr: tcoin.nullAddr,
                value: 0,
                data: code,
            }).then(tx => {
                tcoin.sendTransaction(tx)
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