const api = axios.create({ baseURL: 'https://tcrpc2.mcfx.us/' });

const opts = { dark: false };
Vue.use(Vuetify);

const txsPerPage = 100
const blocksPerPage = 20

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
                <td> {{ tcoin.utils.formatTime(tx.time) }} </td>
                <td><address-span :addr="tx.from == emptyAddr ? 'Miner Reward' : tx.from" :showlink="selfaddr != tx.from && tx.from != emptyAddr" nocopy="1"></address-span></td>
                <td><address-span :addr="tx.to" :showlink="selfaddr != tx.to" nocopy="1"></address-span></td>
                <td> {{ tcoin.utils.showCoin(tx.value) }} TCoin </td>
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

Vue.component('block-list', {
    template: `
    <v-simple-table>
        <thead>
            <tr>
                <th class="text-left">Block</th>
                <th class="text-left">Time</th>
                <th class="text-left">Txn</th>
                <th class="text-left">Miner</th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="block in blocks">
                <td><block-span :height="block.height" showlink="1"></block-span></td>
                <td> {{ tcoin.utils.formatTime(block.time) }} </td>
                <td> {{ block.txs.length }} </td>
                <td><address-span :addr="tcoin.encodeAddr(block.miner)" showlink="1" nocopy="1"></address-span></td>
            </tr>
        </tbody>
    </v-simple-table>
    `,
    props: ['l', 'r'],
    data: function () {
        return {
            blocks: []
        }
    },
    created: function () {
        this.fetch()
    },
    methods: {
        fetch: function () {
            this.blocks = []
            for (let i = this.r; i >= this.l; i--) {
                api.get('get_block/' + i).then(response => {
                    const block = tcoin.decodeBlock(base64ToBytes(response.data.block))
                    const height = tcoin.utils.decodeUint64LE(base64ToBytes(response.data.consensus).slice(0, 8))
                    block.height = height
                    if (height < this.l || height > this.r) return;
                    const l = this.blocks.length
                    if (!l) {
                        this.blocks.push(block)
                    } else if (this.blocks[0].height < height) {
                        this.blocks.unshift(block)
                    } else if (this.blocks[l - 1].height > height) {
                        this.blocks.push(block)
                    } else {
                        for (let j = 0; j + 1 < l; j++) {
                            if (this.blocks[j].height > height && this.blocks[j + 1].height < height) {
                                this.blocks.splice(j + 1, 0, block)
                                break
                            }
                        }
                    }
                })
            }
        }
    },
    watch: {
        l: function () {
            this.fetch()
        }
    }
})

Vue.component('search-box', {
    template: `
    <v-text-field
        v-model="search"
        label="Search for block height / block hash / tx hash / adresss"
        append-outer-icon="mdi-magnify"
        @click:append-outer="doSearch"
        @keydown="keydown"
    ></v-text-field>
    `,
    data: function () {
        return {
            search: '',
        }
    },
    props: ['header'],
    methods: {
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
})

const Account = {
    template: `
    <v-col>
        <p><b>Account</b> <address-span :addr="addr"></address-span></p>
        <p> Balance: {{ tcoin.utils.showCoin(info.balance) }} TCoin </p>
        <p> Nonce: {{ info.nonce }} </p>
        <tx-list :txs="txs" :selfaddr="addr"></tx-list>
		<div class="text-center" v-if="count > txsPerPage">
			<v-pagination v-model="curPage" :length="Math.ceil(count / txsPerPage)" @input="fetch"></v-pagination>
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
            tcoin.getAccountInfo(this.addr).then(info => {
                this.info = info
            })
            this.fetch()
        },
        fetch: function () {
            tcoin.getAccountTransactions(this.addr, this.curPage).then(data => {
                this.txs = data.txs
                this.count = data.total
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
        <p> Type: {{ tx.type == 1 ? "transfer" : "code execution" }} </p>
        <p> Block: <block-span :height="height" showlink="1"></block-span></p>
        <p> From: <address-span :addr="tcoin.encodeAddr(tx.fromAddr)" showlink="1"></address-span></p>
        <div v-if="tx.type == 1">
            <p> To: <address-span :addr="tcoin.encodeAddr(tx.toAddr)" showlink="1"></address-span></p>
            <p> Value: {{ tcoin.utils.showCoin(tx.value) }} TCoin </p>
        </div>
        <p> Gas Limit: {{ tx.gasLimit }} </p>
        <p> Fee: {{ tcoin.utils.showCoin(tx.fee) }} TCoin </p>
        <p> Nonce: {{ tx.nonce }} </p>
        <div v-if="tx.type == 1"><p> Extra data: {{ tcoin.utils.showUtf8(tx.data) }} </p></div>
        <div v-else>
            Call data:
            <v-textarea :value="toHex(tx.data)" rows="1" auto-grow no-resize readonly></v-textarea>
        </div>
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
                this.tx = tcoin.decodeTx(base64ToBytes(response.data.tx))
                this.height = response.data.height
            })
        }
    }
}

const Block = {
    template: `
    <v-col>
        <p><b>Block</b> {{ height }} {{ toHex(block.hash) }}</p>
        <p> Time: {{ tcoin.utils.formatTime(block.time) }} </p>
        <p> Number of txs: {{ typeof(block.txs) == "undefined" || block.txs.length }} </p>
        <p> Miner: <address-span :addr="tcoin.encodeAddr(block.miner)" showlink="1"></address-span></p>
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
                this.block = tcoin.decodeBlock(base64ToBytes(response.data.block))
                this.height = tcoin.utils.decodeUint64LE(base64ToBytes(response.data.consensus).slice(0, 8))
                const utxs = []
                for (const tx of this.block.txs) {
                    utxs.push({
                        hash: sha256(tx.raw),
                        blockid: this.height,
                        time: this.block.time,
                        from: tcoin.encodeAddr(tx.fromAddr),
                        to: tcoin.encodeAddr(tx.toAddr),
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

const Blocks = {
    template: `
    <v-col>
        <p><b>Block</b> {{ l }} ~ {{ r }} </p>
        <block-list :l="l" :r="r"></block-list>
		<div class="text-center" v-if="count > blocksPerPage">
			<v-pagination v-model="curPage" :length="Math.ceil(count / blocksPerPage)" @input="fetch"></v-pagination>
		</div>
    </v-col>
    `,
    data: function () {
        return {
            r: -1,
            curPage: 0,
            count: 0
        }
    },
    computed: {
        l: function () {
            return Math.max(0, this.r - blocksPerPage + 1)
        }
    },
    created: function () {
        this.init()
    },
    methods: {
        init: function () {
            const tmp = parseInt(this.$route.params.r)
            api.get('get_highest').then(response => {
                this.count = tcoin.utils.decodeUint64LE(base64ToBytes(response.data.consensus).slice(0, 8)) + 1
                this.curPage = Math.floor((this.count - tmp) / blocksPerPage) + 1
                this.fetch()
            })
        },
        fetch: function () {
            this.r = this.count - 1 - blocksPerPage * (this.curPage - 1)
            this.$router.push({ name: 'blocks', params: { r: this.r } })
        }
    },
    beforeRouteUpdate(_to, _from, next) {
        next()
        this.init()
    }
}

const Index = {
    template: `
    <v-col>
        <p><b>Latest Blocks</b></p>
        <block-list :l="bl" :r="br"></block-list>
        <p></p>
        <p><v-btn class="no-upper-case" outlined @click="gotoBlocks"> View all blocks </v-btn></p>
    </v-col>
    `,
    data: function () {
        return {
            height: 0,
            block: '',
            bl: 0,
            br: -1
        }
    },
    created: function () {
        this.fetch()
    },
    methods: {
        fetch: function () {
            api.get('get_highest').then(response => {
                this.block = tcoin.decodeBlock(base64ToBytes(response.data.block))
                this.height = tcoin.utils.decodeUint64LE(base64ToBytes(response.data.consensus).slice(0, 8))
                this.bl = this.height - 4
                this.br = this.height
            })
        },
        gotoBlocks: function () {
            this.$router.push({ name: 'blocks', params: { r: this.br } })
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
        { path: '/blocks/:r', component: Blocks, name: 'blocks' },
    ]
})

new Vue({
    router,
    el: '#app',
    vuetify: new Vuetify(opts)
})