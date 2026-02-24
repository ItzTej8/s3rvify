import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys"
import qrcode from "qrcode-terminal"

// ===== USER STATE =====
const userState = {}
var servifyToken = "";
var cookieHeader = "";

// ===== PRODUCTS =====
const products = [
    "Air Conditioners", "Dishwasher", "Laptops", "Microwave Oven", "Oven",
    "Refrigerators", "Smart Watches", "Smartphones", "Tablets", "Televisions", "Washing Machines"
]

// ===== LANGUAGE =====
const langText = {
    en: {
        askLang: "Select Language:\n1. English\n2. Hindi",
        askProduct: "Select Product:",
        askModel: "Please enter Model Number:",
        checking: "⏳ Checking plans...",
        success: "✅ Plans fetched"
    },
    hi: {
        askLang: "भाषा चुनें:\n1. अंग्रेज़ी\n2. हिंदी",
        askProduct: "उत्पाद चुनें:",
        askModel: "मॉडल नंबर दर्ज करें:",
        checking: "⏳ प्लान चेक हो रहा है...",
        success: "✅ प्लान मिल गए"
    }
}

// ===== SERVIFY LOGIN =====
const loginServify = async () => {
    try {
        const r = await fetch("https://360.servify.in/userLogin", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                loginId: "4959632@SVC",
                password: "2026@Servify"
            })
        })


        // ⭐ GET COOKIES
        const cookies = r.headers.getSetCookie()

        const parsed = Object.fromEntries(
            cookies.map(c => {
                const [pair] = c.split(";")
                const [k, v] = pair.split("=")
                return [k, v]
            })
        )

        console.log("Authorization:", parsed.authorization)
        console.log("UID:", parsed.UID)

        cookieHeader = `authorization=${parsed.authorization}; UID=${parsed.UID}`;

        console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>", cookieHeader);

        const j = await r.json()

        if (j?.data?.token) {
            servifyToken = j.data.token
            console.log("✅ Servify Login OK")
        } else {
            console.log("❌ Login Failed", j)
        }

    } catch (e) {
        console.log("Login error", e)
    }
}

var ModelNo = "";
const CountryCode = "IN";
const PartnerID = "bkJfkM0ACzHja4rJyN8a3VwI9-y1eX0XlNTDn9YveJ16gJW1I3c=";
const PartnerLocationStateCode = 27;
const PartnerServiceLocationID = "MzI4MTc3";
const salesChannel = "ASC-Portal";
const ProductSubCategoryID = 6



// ===== FETCH PLANS WITH RETRY =====
const fetchPlans = async (modelNo, ProductID) => {


    const callAPI = async () => {
        const r = await fetch(
            "https://360.servify.in/api/v1/Aegis/fetchEligiblePlans",
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": servifyToken
                },
                body: JSON.stringify({
                    ProductID: ProductID,
                    BrandID: 2,
                    CountryCode: CountryCode,
                    PartnerID: PartnerID,
                    ModelNo: modelNo
                })
            }
        )
        return r.json()
    }

    let data = await callAPI()

    // 🔥 Session retry
    if (data?.msg === "Session expired") {
        console.log("🔄 Session expired, re-login...")
        await loginServify()
        data = await callAPI()
    }

    // ✅ Extract plans
    const planObject =
        data?.data?.find(x => x?.PlanObject)?.PlanObject || []

    return planObject
}





const fetchProductDetails = async (modelNo, cookieHeader) => {

    console.log("servifyToken>>>>", servifyToken)

    console.log("servifyToken complete");

    if (!servifyToken && servifyToken === "") await loginServify()

    console.log("modelNo, cookieHeader >>>>", modelNo, cookieHeader);

    console.log("modelNo, cookieHeader complete");

    const callAPI = async () => {
        const r = await fetch("https://360.servify.in/api/v1/Aegis/getPlanProductSKUModelNos", {
            "headers": {
                "accept": "application/json, text/plain, */*",
                "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,mr;q=0.7",
                "content-type": "application/json; charset=UTF-8",
                "languagecode": "en",
                "priority": "u=1, i",
                "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Google Chrome\";v=\"145\", \"Chromium\";v=\"145\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "timezone": "+05:30",
                "cookie": cookieHeader,
                "Referer": "https://360.servify.in/plansales?pslid=MzI4MTc3"
            },
            "body": "{\"BrandID\":2,\"ProductSubCategoryID\":137,\"CountryID\":\"MTA1\",\"app\":\"360App\",\"ProductSkuModelNo\":" + modelNo + ",\"pagination\":{\"pageNo\":1,\"range\":3,\"itemsPerPage\":3}}",
            "method": "POST"
        });

        return r.json()
    }

    const data = await callAPI()

    console.log(data)

    console.log(data.data.skuModelList);

    const skuModelList = data.data.skuModelList;

    if (skuModelList.length > 0) {
        return skuModelList
    }
    else {
        null;
    }






}



// ===== BOT =====
const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("auth")

    const sock = makeWASocket({ auth: state, printQRInTerminal: false })

    sock.ev.on("connection.update", ({ connection, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === "open") console.log("✅ Bot Connected")
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return
        if (msg.key.fromMe) return

        const jid = msg.key.remoteJid

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text

        if (!text) return

        const input = text.trim()
        const state = userState[jid]

        // ===== START =====
        if (input.toLowerCase() === "carepack") {
            userState[jid] = { step: "lang" }
            return sock.sendMessage(jid, { text: langText.en.askLang })
        }

        if (!state) return

        // ===== LANGUAGE =====
        if (state.step === "lang") {
            const lang = input === "2" ? "hi" : "en"
            state.lang = lang
            state.step = "product"

            let menu = langText[lang].askProduct + "\n"
            products.forEach((p, i) => menu += `\n${i + 1}. ${p}`)

            return sock.sendMessage(jid, { text: menu })
        }

        // ===== PRODUCT =====
        if (state.step === "product") {
            const n = parseInt(input)
            if (n < 1 || n > products.length) return

            state.product = products[n - 1]
            state.step = "model"

            return sock.sendMessage(jid, {
                text: `📦 ${state.product}\n${langText[state.lang].askModel}`
            })
        }

        // ===== MODEL NUMBER =====
        if (state.step === "model") {

            await sock.sendMessage(jid, {
                text: langText[state.lang].checking
            })

            const prodDetails = await fetchProductDetails(input, cookieHeader)

            const prodID = prodDetails[0].productID;

            const plans = await fetchPlans(input, prodID);
            console.log("plans>>>>>>>>>>>>>>>>>>>>>.", plans.length)

            if (!plans.length) {
                await sock.sendMessage(jid, {
                    text: "❌ No plans found for this model"
                })
                delete userState[jid]
                return
            }

            // ✅ Format message
            let msg = "📋 *Available CarePack Plans:*\n\n"

            plans
                .filter(p => p?.PlanName && p?.PlanPrice && p?.ExternalPlanCode)
                .forEach((p, i) => {
                    msg += `*${i + 1}. ${p.PlanName}*\n`
                    msg += `💰 Price: ₹${p.PlanPrice}\n`
                    msg += `🆔 Carepack Code: ${p.ExternalPlanCode}\n\n`
                })



            if (plans[0].AboutLink) {
                msg += `🔗 Terms and conditions: ${plans[0].AboutLink}\n`
            }

            await sock.sendMessage(jid, { text: msg })

            delete userState[jid]
        }


    })
}

startBot()





const loginServify2 = async () => {

    const req = await fetch("https://360.servify.in/userLogin", {
        "headers": {
            "content-type": "application/json;charset=UTF-8",
            "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Google Chrome\";v=\"145\", \"Chromium\";v=\"145\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "Referer": "https://360.servify.in/"
        },
        "body": "{\"loginId\":\"4959632@SVC\",\"password\":\"2026@Servify\"}",
        "method": "POST"
    });

    const res = await req.json();
    console.log(req);


}

//loginServify2();



