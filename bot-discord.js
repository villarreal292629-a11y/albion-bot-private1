const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, onSnapshot } = require('firebase/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyDpeU-EdJxpiJezbeTR3q0cqzaPsqbyRSE",
    authDomain: "albion-recursos-timer2.firebaseapp.com",
    projectId: "albion-recursos-timer2",
    storageBucket: "albion-recursos-timer2.firebasestorage.app",
    messagingSenderId: "433735759115",
    appId: "1:433735759115:web:0b350353fc8854866bde0e"
};

// ⚠️ EL TOKEN SE TOMA DE LAS VARIABLES DE ENTORNO ⚠️
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CANAL_RECURSOS_ID = process.env.CANAL_RECURSOS_ID || "1484338186959327342";
const CANAL_CONTADORES_ID = process.env.CANAL_CONTADORES_ID || "1484723137177452654";

if (!DISCORD_TOKEN) {
    console.error('❌ ERROR: DISCORD_TOKEN no está configurado en las variables de entorno');
    process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const recursosRef = collection(db, "recursos");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let mensajeUnicoId = null;

const ICONOS = {
    '🌲 Madera': '🪵',
    '⛏️ Mineral': '💎',
    '🌾 Fibra': '🌿',
    '🪨 Piedra': '🗻',
    '💧 Piel': '🐾'
};

function obtenerIcono(tipo) {
    return ICONOS[tipo] || '📦';
}

function formatearTiempoRestante(segundosTotales, startTime) {
    const inicio = new Date(startTime).getTime();
    const ahora = Date.now();
    const tiempoTranscurrido = (ahora - inicio) / 1000;
    const segundosRestantes = Math.max(0, segundosTotales - tiempoTranscurrido);
    const horas = Math.floor(segundosRestantes / 3600);
    const minutos = Math.floor((segundosRestantes % 3600) / 60);
    const segundos = Math.floor(segundosRestantes % 60);
    return { horas, minutos, segundos, segundosRestantes };
}

function formatearContador(horas, minutos, segundos) {
    if (horas > 0) return `⏰ **${horas}h ${minutos}m ${segundos}s**`;
    if (minutos > 0) return `⌛ **${minutos}m ${segundos}s**`;
    return `⚡ **${segundos}s**`;
}

function extraerNivel(nombre) {
    const match = nombre.match(/(\d+(?:\.\d+)?)/);
    return match ? match[1] : '';
}

function obtenerEmojiNivel(nivel) {
    const num = parseFloat(nivel);
    if (num >= 8) return '🔴';
    if (num >= 7) return '🟠';
    if (num >= 6) return '🟡';
    if (num >= 5) return '🟢';
    return '🔵';
}

async function actualizarOMensajeUnico() {
    try {
        const canal = client.channels.cache.get(CANAL_CONTADORES_ID);
        if (!canal) return;

        const snapshot = await getDocs(recursosRef);
        const recursos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const activos = recursos.filter(r => {
            const t = formatearTiempoRestante(r.tiempoTotalSegundos, r.startTime);
            return t.segundosRestantes > 0;
        });

        activos.sort((a, b) => {
            const ta = formatearTiempoRestante(a.tiempoTotalSegundos, a.startTime).segundosRestantes;
            const tb = formatearTiempoRestante(b.tiempoTotalSegundos, b.startTime).segundosRestantes;
            return ta - tb;
        });

        const embed = new EmbedBuilder()
            .setTitle('📋 **RECURSOS ACTIVOS**')
            .setColor(0xffd700)
            .setFooter({ text: `🔄 Actualizado • ${new Date().toLocaleTimeString()} • ${activos.length} recursos` });

        if (activos.length === 0) {
            embed.setDescription('✨ *No hay recursos activos en este momento.*\n\n💡 **Cómo añadir:**\n`Madera 4.4 | Bosque Negro | 2:30`');
            embed.setColor(0x4aff9e);
        } else {
            let descripcion = '';
            
            for (let i = 0; i < activos.length; i++) {
                const r = activos[i];
                const tiempo = formatearTiempoRestante(r.tiempoTotalSegundos, r.startTime);
                const contador = formatearContador(tiempo.horas, tiempo.minutos, tiempo.segundos);
                const icono = obtenerIcono(r.type);
                const nivel = extraerNivel(r.name);
                const emojiNivel = obtenerEmojiNivel(nivel);
                
                if (i > 0) descripcion += '\nㅤ\n';
                
                descripcion += `╔════════════════════════════════════════════╗\n`;
                descripcion += `║ **${icono} ${r.name}** ${emojiNivel} \`${nivel}\`\n`;
                descripcion += `║ 📍 **Zona:** ${r.zone}\n`;
                descripcion += `║ ⏱️ **Restante:** ${contador}\n`;
                descripcion += `╚════════════════════════════════════════════╝`;
            }
            
            embed.setDescription(descripcion);
            
            const proximo = activos[0];
            const tp = formatearTiempoRestante(proximo.tiempoTotalSegundos, proximo.startTime);
            const contadorProximo = formatearContador(tp.horas, tp.minutos, tp.segundos);
            
            embed.addFields(
                { name: '📊 **RESUMEN**', value: `└ **${activos.length}** recursos activos`, inline: true },
                { name: '🕐 **PRÓXIMO**', value: `└ ${contadorProximo}`, inline: true },
                { name: '💡 **CÓMO AÑADIR**', value: '└ `Nombre | Zona | Tiempo`', inline: true }
            );
        }

        if (mensajeUnicoId) {
            try {
                const msg = await canal.messages.fetch(mensajeUnicoId);
                if (msg) {
                    await msg.edit({ embeds: [embed] });
                    console.log('📊 Mensaje actualizado');
                    return;
                }
            } catch (e) {
                mensajeUnicoId = null;
            }
        }

        const newMsg = await canal.send({ embeds: [embed] });
        mensajeUnicoId = newMsg.id;
        console.log('📊 Mensaje único creado');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

function detectarTipo(nombre) {
    const n = nombre.toLowerCase();
    if (n.includes('mineral')) return "⛏️ Mineral";
    if (n.includes('fibra')) return "🌾 Fibra";
    if (n.includes('piedra')) return "🪨 Piedra";
    if (n.includes('piel')) return "💧 Piel";
    return "🌲 Madera";
}

function convertirTiempoASegundos(tiempoStr) {
    let horas = 0, minutos = 0, segundos = 0;
    if (tiempoStr.includes(':')) {
        const partes = tiempoStr.split(':').map(p => parseInt(p) || 0);
        if (partes.length === 3) { horas = partes[0]; minutos = partes[1]; segundos = partes[2]; }
        else if (partes.length === 2) { horas = partes[0]; minutos = partes[1]; }
        else horas = partes[0];
    } else horas = parseFloat(tiempoStr) || 0;
    if (minutos >= 60) { horas += Math.floor(minutos / 60); minutos %= 60; }
    return { horas, minutos, segundos, segundosTotales: (horas * 3600) + (minutos * 60) + segundos };
}

async function procesarMensaje(mensaje) {
    const partes = mensaje.split('|').map(p => p.trim());
    if (partes.length < 3) return null;
    const nombre = partes[0];
    const zona = partes[1];
    const tiempoStr = partes[2];
    if (!nombre || !zona || !tiempoStr) return null;
    const tiempo = convertirTiempoASegundos(tiempoStr);
    if (tiempo.segundosTotales <= 0) return null;
    return {
        name: nombre,
        type: detectarTipo(nombre),
        zone: zona,
        horasTotales: tiempo.horas,
        minutosTotales: tiempo.minutos,
        segundosTotalesAdicionales: tiempo.segundos,
        tiempoTotalSegundos: tiempo.segundosTotales,
        startTime: new Date().toISOString(),
        reportedAt: new Date().toISOString(),
        reportedBy: "Discord Bot"
    };
}

onSnapshot(recursosRef, async () => {
    console.log('📡 Cambio detectado');
    await actualizarOMensajeUnico();
});

client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    await actualizarOMensajeUnico();
    setInterval(actualizarOMensajeUnico, 10000);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== CANAL_RECURSOS_ID) return;

    console.log(`📩 Mensaje: ${message.content}`);
    const recurso = await procesarMensaje(message.content);

    if (recurso) {
        try {
            await addDoc(recursosRef, recurso);
            await message.react('✅');
            await message.reply(
                `✅ **${recurso.name}** añadido!\n` +
                `📍 **Zona:** ${recurso.zone}\n` +
                `⏰ **Temporizador:** ${recurso.horasTotales}:${recurso.minutosTotales.toString().padStart(2, '0')}\n` +
                `📊 Revisa la tabla en <#${CANAL_CONTADORES_ID}>`
            );
            console.log(`✅ Guardado: ${recurso.name}`);
        } catch (error) {
            await message.react('❌');
        }
    } else {
        await message.reply('⚠️ **Formato:** `Piel 5.4 | Praderas | 10:15:00`');
    }
});

client.login(DISCORD_TOKEN);
