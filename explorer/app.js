const api = axios.create({ baseURL: rpcUrl });

const opts = { dark: false };
Vue.use(Vuetify);

const resultsPerPage = 100

Vue.component('address-span', {
    template: `
    <span>
        <span v-if="showlink">
            <a @click="go"> {{ addr }} </a>
        </span>
        <span v-else>
            {{ addr }}
        </span>
        <v-btn text icon small v-on:click="copyTextToClipboard(addr)" v-if="!nocopy">
            <v-icon>mdi-content-copy</v-icon>
        </v-btn>
    </span>
	`,
    props: ['addr', 'nocopy', 'showlink', 'router'],
    methods: {
        go: function () {
            this.$router.push({ name: 'account', params: { 'addr': this.addr } })
        }
    }
})

Vue.component('block-span', {
    template: `
    <span>
        <span v-if="showlink">
            <a @click="go"> {{ height }} </a>
        </span>
        <span v-else>
            {{ height }}
        </span>
    </span>
	`,
    props: ['height', 'showlink'],
    methods: {
        go: function () {
            this.$router.push({ name: 'block', params: { 'p': this.height.toString() } })
        }
    }
})

Vue.component('tx-list', {
    template: `
    <v-simple-table>
        <thead>
            <tr>
                <th class="text-left">Txh</th>
                <th class="text-left">Block</th>
                <th class="text-left">Time</th>
                <th class="text-left">From</th>
                <th class="text-left">To</th>
                <th class="text-left">Value</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="tx in txs">
                <td>
                    <span v-if="tx.hash == emptyHash"> Miner Reward </span>
                    <span v-else><a @click="gotoTx(tx.hash)"> {{ tx.hash.substring(0, 10) + '...' }} </a></span>
                </td>
                <td><block-span :height="tx.blockid" :showlink="selfblock != tx.blockid"></block-span></td>
                <td> {{ formatTime(tx.time) }} </td>
                <td><address-span :addr="tx.from == emptyAddr ? 'Miner Reward' : tx.from" :showlink="selfaddr != tx.from && tx.from != emptyAddr" nocopy="1"></address-span></td>
                <td><address-span :addr="tx.to" :showlink="selfaddr != tx.to" nocopy="1"></address-span></td>
                <td> {{ showCoin(tx.value) }} TCoin </td>
            </tr>
        </tbody>
    </v-simple-table>
	`,
    props: ['txs', 'selfaddr', 'selfblock'],
    data: function () {
        return {
            emptyAddr: 'tcoin2K3n5t4wSaF5mj27Tw9vStXWLWyRjjiH5Cp3CFLpKVCr1d',
            emptyHash: '0000000000000000000000000000000000000000000000000000000000000000'
        }
    },
    methods: {
        gotoTx: function (txh) {
            this.$router.push({ name: 'tx', params: { 'txh': txh } })
        }
    }
})

const Account = {
    template: `
    <v-col>
        <p><b>Account</b> <address-span :addr="addr"></address-span></p>
        <p> Balance: {{ showCoin(info.balance) }} TCoin </p>
        <p> Nonce: {{ info.nonce }} </p>
        <tx-list :txs="txs" :selfaddr="addr"></tx-list>
		<div class="text-center" v-if="count > resultsPerPage">
			<v-pagination v-model="curPage" :length="Math.ceil(count / resultsPerPage)" @input="fetch"></v-pagination>
		</div>
    </v-col>
    `,
    data: function () {
        return {
            addr: '',
            txs: [],
            curPage: 1,
            count: 0,
            info: { balance: 0, nonce: 0 },
        }
    },
    created: function () {
        this.init()
    },
    methods: {
        init: function () {
            this.addr = this.$route.params.addr
            this.curPage = 1
            api.get('get_account_info/' + this.addr).then(response => {
                this.info = response.data.data
            })
            this.fetch()
        },
        fetch: function () {
            api.get('explorer/get_account_transactions/' + this.addr + '/' + this.curPage).then(response => {
                this.txs = response.data.txs
                this.count = response.data.total
            })
        }
    },
    beforeRouteUpdate(_to, _from, next) {
        next()
        this.init()
    }
}

const Transaction = {
    template: `
    <v-col>
        <p><b>Transaction</b> {{ txh }}</p>
        <p> Block: <block-span :height="height" showlink="1"></block-span></p>
        <p> From: <address-span :addr="encodeAddr(tx.fromAddr)" showlink="1"></address-span></p>
        <p> To: <address-span :addr="encodeAddr(tx.toAddr)" showlink="1"></address-span></p>
        <p> Value: {{ showCoin(tx.value) }} TCoin </p>
        <p> Gas Limit: {{ tx.gasLimit }} </p>
        <p> Fee: {{ showCoin(tx.fee) }} TCoin </p>
        <p> Nonce: {{ tx.nonce }} </p>
        <p> Extra data: {{ showUtf8(tx.data) }} </p>
    </v-col>
    `,
    data: function () {
        return {
            txh: '',
            tx: '',
            height: 0,
        }
    },
    created: function () {
        this.txh = this.$route.params.txh
        this.fetch()
    },
    methods: {
        fetch: function () {
            api.get('explorer/get_transaction/' + this.txh).then(response => {
                this.tx = decodeTx(base64ToBytes(response.data.tx))
                this.height = response.data.height
            })
        }
    }
}

const Block = {
    template: `
    <v-col>
        <p><b>Block</b> {{ height }} {{ toHex(block.hash) }}</p>
        <p> Time: {{ formatTime(block.time) }} </p>
        <p> Number of txs: {{ typeof(block.txs) == "undefined" || block.txs.length }} </p>
        <p> Miner: <address-span :addr="encodeAddr(block.miner)" showlink="1"></address-span></p>
        <tx-list :txs="txs"></tx-list>
    </v-col>
    `,
    data: function () {
        return {
            hash: '',
            block: '',
            param: '',
            height: 0,
            txs: '',
        }
    },
    created: function () {
        this.fetch()
    },
    methods: {
        fetch: function () {
            this.param = this.$route.params.p
            const apiPath = this.param.length == 64 ? 'explorer/get_block_by_hash' : 'get_block'
            api.get(apiPath + '/' + this.param).then(response => {
                this.block = decodeBlock(base64ToBytes(response.data.block))
                this.height = decodeUint64LE(base64ToBytes(response.data.consensus).slice(0, 8))
                const utxs = []
                for (const tx of this.block.txs) {
                    utxs.push({
                        hash: sha256(tx.raw),
                        blockid: this.height,
                        time: this.block.time,
                        from: encodeAddr(tx.fromAddr),
                        to: encodeAddr(tx.toAddr),
                        value: tx.value
                    })
                }
                this.txs = utxs
            })
        }
    },
    beforeRouteUpdate(_to, _from, next) {
        next()
        this.fetch()
    }
}

const Index = {
    template: `
    <v-col>
        <v-text-field
            v-model="search"
            label="Search for block height / block hash / tx hash / adresss"
            append-outer-icon="mdi-magnify"
            @click:append-outer="doSearch"
            @keydown="keydown"
        ></v-text-field>
        <p><b>Latest Block</b> <block-span :height="height" showlink="1"></block-span> {{ toHex(block.hash) }} </p>
    </v-col>
    `,
    data: function () {
        return {
            search: '',
            height: 0,
            block: '',
        }
    },
    created: function () {
        this.fetch()
    },
    methods: {
        fetch: function () {
            api.get('get_highest').then(response => {
                this.block = decodeBlock(base64ToBytes(response.data.block))
                this.height = decodeUint64LE(base64ToBytes(response.data.consensus).slice(0, 8))
            })
        },
        doSearch: function () {
            if (this.search.startsWith('tcoin')) {
                this.$router.push({ name: 'account', params: { 'addr': this.search } })
            } else if (this.search.length != 64) {
                this.$router.push({ name: 'block', params: { 'p': this.search } })
            } else {
                api.get('explorer/get_transaction/' + this.search).then(response => {
                    if (response.data.status) {
                        this.$router.push({ name: 'tx', params: { 'txh': this.search } })
                    } else {
                        this.$router.push({ name: 'block', params: { 'p': this.search } })
                    }
                })
            }
        },
        keydown: function (e) {
            if (e.key == 'Enter') this.doSearch()
        }
    }
}

const router = new VueRouter({
    mode: 'hash',
    routes: [
        { path: '/', component: Index, name: 'index' },
        { path: '/account/:addr', component: Account, name: 'account' },
        { path: '/tx/:txh', component: Transaction, name: 'tx' },
        { path: '/block/:p', component: Block, name: 'block' },
    ]
})

new Vue({
    router,
    el: '#app',
    vuetify: new Vuetify(opts)
})