sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;
    if (msg.key.fromMe) return; 

    const sender = msg.key.remoteJid;
    const isGroup = sender.endsWith('@g.us'); // Check if message is from a group
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").toLowerCase().trim();

    // 1. SILENT EXIT: If there is no text (e.g., a sticker or just an image with no text), do nothing.
    if (!text) return;

    // 2. GROUP PROTECTION: If in a group, only respond if the bot is mentioned or "order/menu" is used
    // (Optional: Remove this 'if' if you want the bot to respond to everyone in groups)
    if (isGroup && !text.includes("menu") && !text.includes("order")) return;

    console.log(`📩 Query from ${sender}: ${text}`);

    // --- STEP 2: FINISH ORDER FLOW ---
    if (orderStates[sender]?.step === 'WAITING_FOR_ADDRESS') {
        const customerDetails = text;
        const item = orderStates[sender].item;
        const customerWaNumber = sender.split('@')[0];

        const javaGoatOrder = {
            userId: "whatsapp_" + customerWaNumber,
            userEmail: "whatsapp@javagoat.com",
            phone: customerWaNumber,
            address: customerDetails,
            location: { lat: 0, lng: 0 },
            items: [{
                id: item.id,
                name: item.name,
                price: parseFloat(item.price),
                img: item.imageUrl || "",
                quantity: 1
            }],
            total: (parseFloat(item.price) + 50).toFixed(2),
            status: "Placed",
            method: "Cash on Delivery (WhatsApp)",
            timestamp: new Date().toISOString()
        };

        try {
            await fetch(`${FIREBASE_URL}/orders.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(javaGoatOrder)
            });
            await sock.sendMessage(sender, { text: `✅ *Order Placed Successfully!* \n\nThank you! Your order for *${item.name}* is being prepared.\n\n*Total:* ₹${javaGoatOrder.total}\n*Status:* Preparing` });
        } catch (error) {
            console.log("Firebase Error: ", error);
            await sock.sendMessage(sender, { text: "❌ System error. Please try again later." });
        }

        delete orderStates[sender]; 
        return; // Stop here!
    }

    // --- STEP 1: START ORDER FLOW ---
    if (text.startsWith("order ")) {
        const productRequested = text.replace("order ", "").trim();
        const currentMenu = await getMenuFromApp();
        const matchedItem = currentMenu.find(item => item.name.toLowerCase().includes(productRequested));

        if (!matchedItem) {
            await sock.sendMessage(sender, { text: `❌ Sorry, we couldn't find *${productRequested}*.\n\nType *menu* to see all items.` });
            return;
        }

        orderStates[sender] = { step: 'WAITING_FOR_ADDRESS', item: matchedItem };
        const captionText = `🛒 *Order Started!* \n\nYou selected: *${matchedItem.name}* (₹${matchedItem.price})\n\nPlease reply with your *Full Name, Phone Number, and Delivery Address*.`;
        
        if (matchedItem.imageUrl) {
            await sock.sendMessage(sender, { image: { url: matchedItem.imageUrl }, caption: captionText });
        } else {
            await sock.sendMessage(sender, { text: captionText });
        }
        return; // Stop here!
    }

    if (text === "order") { 
        await sock.sendMessage(sender, { text: "🛒 *How to order:* \nPlease type 'order' followed by the dish name. \nExample: *order pizza*" });
        return;
    }
    
    // --- DYNAMIC MENU ---
    if (text.includes("menu") || text.includes("price") || text.includes("list") || text.includes("food")) {
        const currentMenu = await getMenuFromApp();
        if (currentMenu.length === 0) {
            await sock.sendMessage(sender, { text: "Our menu is currently updating. Please check back soon!" });
            return;
        }

        let menuMessage = "🍔 *JAVAGOAT LIVE MENU* 🍕\n\n";
        currentMenu.forEach(item => {
            menuMessage += `🔸 *${item.name}* - ₹${item.price}\n`;
        });
        menuMessage += "\n_To order, reply with 'order [dish name]'_";
        
        await sock.sendMessage(sender, { text: menuMessage });
        return;
    }

    // --- GREETINGS ---
    if (text.match(/\b(hi|hello|hey|hola)\b/)) {
        await sock.sendMessage(sender, { text: "👋 *Welcome to JavaGoat!* \n\nI am your AI Assistant. Type *menu* to see our delicious food, or type *order [dish]* to buy instantly!" });
        return;
    }

    if (text.includes("contact") || text.includes("call")) {
        await sock.sendMessage(sender, { text: "📞 *Contact JavaGoat:* \n\n- *Email:* support@javagoat.com" });
        return;
    }

    // --- FINAL FALLBACK ---
    // Only send this if it's a Private Chat. 
    // This prevents the bot from annoying everyone in a Group Chat.
    if (!isGroup) {
        await sock.sendMessage(sender, { text: "🤔 I didn't quite catch that.\n\nType *menu* to see our food list, or *order [food]* to place an order!" });
    }
});
