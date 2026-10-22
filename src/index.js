function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getStock(env) {
  return env.DB.prepare(`
    SELECT
      p.id,
      p.code,
      p.name,
      p.units_per_pack,
      COALESCE(SUM(m.quantity_eggs), 0) AS available_eggs
    FROM products p
    LEFT JOIN inventory_movements m ON m.product_id = p.id
    WHERE p.code = ? AND p.active = 1
    GROUP BY p.id, p.code, p.name, p.units_per_pack
  `).bind("OVOS-6").first();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ success: true, service: "doslilinhos-website", database: "connected" });
    }

    if (request.method === "GET" && url.pathname === "/api/stock") {
      try {
        const product = await getStock(env);
        if (!product) return json({ success: false, error: "Produto não encontrado" }, 404);

        const availableEggs = Math.max(0, Number(product.available_eggs || 0));
        const unitsPerPack = Number(product.units_per_pack || 6);

        return json({
          success: true,
          product: { code: product.code, name: product.name, unitsPerPack },
          stock: {
            availableEggs,
            availablePacks: Math.floor(availableEggs / unitsPerPack),
            available: availableEggs >= unitsPerPack
          },
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("Erro ao consultar stock:", error);
        return json({ success: false, error: "Não foi possível consultar o stock" }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/reservations") {
      try {
        const body = await request.json();
        const name = cleanText(body.name, 100);
        const email = cleanText(body.email, 160).toLowerCase();
        const packs = Number(body.packs);

        if (name.length < 2) return json({ success: false, error: "Indique um nome válido" }, 400);
        if (!validEmail(email)) return json({ success: false, error: "Indique um email válido" }, 400);
        if (!Number.isInteger(packs) || packs < 1 || packs > 50) {
          return json({ success: false, error: "Quantidade inválida" }, 400);
        }

        const product = await getStock(env);
        if (!product) return json({ success: false, error: "Produto não encontrado" }, 404);

        const unitsPerPack = Number(product.units_per_pack || 6);
        const quantityEggs = packs * unitsPerPack;
        const availableEggs = Math.max(0, Number(product.available_eggs || 0));

        if (quantityEggs > availableEggs) {
          return json({ success: false, error: "Já não existe stock suficiente", availablePacks: Math.floor(availableEggs / unitsPerPack) }, 409);
        }

        const reservationNumber = `DL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
        const reservedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO reservations (
              reservation_number, product_id, customer_name, customer_email,
              packs, quantity_eggs, status, reserved_until
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
          `).bind(reservationNumber, product.id, name, email, packs, quantityEggs, reservedUntil),
          env.DB.prepare(`
            INSERT INTO inventory_movements (
              product_id, movement_type, quantity_eggs,
              reference_type, reference_id, notes
            ) VALUES (?, 'reservation', ?, 'reservation',
              (SELECT id FROM reservations WHERE reservation_number = ?), ?)
          `).bind(product.id, -quantityEggs, reservationNumber, `Reserva ${reservationNumber}`)
        ]);

        return json({
          success: true,
          reservation: {
            number: reservationNumber,
            packs,
            quantityEggs,
            status: "pending",
            reservedUntil
          }
        }, 201);
      } catch (error) {
        console.error("Erro ao criar reserva:", error);
        return json({ success: false, error: "Não foi possível criar a reserva" }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ success: false, error: "Endpoint não encontrado" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
