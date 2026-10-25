function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}
function json(data, status = 200, cors = false) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(cors ? corsHeaders() : {})
    }
  });
}
function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}
function isAdmin(request, env) { return Boolean(env.ADMIN_TOKEN && bearer(request) === env.ADMIN_TOKEN); }
function isPwa(request, env) { return Boolean(env.PWA_STOCK_TOKEN && bearer(request) === env.PWA_STOCK_TOKEN); }
function unauthorized(cors = false) { return json({ success: false, error: "Não autorizado" }, 401, cors); }
function cleanText(value, max = 160) { return String(value || "").trim().slice(0, max); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function productionMethod(date) {
  const month = Number(String(date).slice(5, 7));
  return month >= 3 && month <= 10 ? "pasture" : "indoor_careful";
}
async function getStock(env) {
  return env.DB.prepare(`SELECT p.id,p.code,p.name,p.units_per_pack,COALESCE(SUM(m.quantity_eggs),0) AS available_eggs FROM products p LEFT JOIN inventory_movements m ON m.product_id=p.id WHERE p.code=? AND p.active=1 GROUP BY p.id,p.code,p.name,p.units_per_pack`).bind("OVOS-6").first();
}
async function listReservations(env) {
  return env.DB.prepare(`SELECT r.id,r.reservation_number,r.customer_name,r.customer_email,r.packs,r.quantity_eggs,r.status,r.reserved_until,r.created_at,p.name AS product_name FROM reservations r JOIN products p ON p.id=r.product_id ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 200`).all();
}
async function changeReservationStatus(env,id,action){
  const r=await env.DB.prepare(`SELECT id,product_id,reservation_number,quantity_eggs,status FROM reservations WHERE id=?`).bind(id).first();
  if(!r)return{error:"Reserva não encontrada",status:404};
  if(action==="confirm"){
    if(r.status!=="pending")return{error:"Só reservas pendentes podem ser confirmadas",status:409};
    await env.DB.prepare("UPDATE reservations SET status='confirmed' WHERE id=? AND status='pending'").bind(id).run();return{success:true,newStatus:"confirmed"};
  }
  if(action==="complete"){
    if(!["pending","confirmed"].includes(r.status))return{error:"Esta reserva não pode ser concluída",status:409};
    await env.DB.prepare("UPDATE reservations SET status='completed' WHERE id=? AND status IN ('pending','confirmed')").bind(id).run();return{success:true,newStatus:"completed"};
  }
  if(action==="cancel"){
    if(!["pending","confirmed"].includes(r.status))return{error:"Esta reserva não pode ser cancelada",status:409};
    await env.DB.batch([
      env.DB.prepare("UPDATE reservations SET status='cancelled' WHERE id=? AND status IN ('pending','confirmed')").bind(id),
      env.DB.prepare(`INSERT INTO inventory_movements(product_id,movement_type,quantity_eggs,reference_type,reference_id,notes) VALUES(?,'reservation_cancelled',?,'reservation',?,?)`).bind(r.product_id,Number(r.quantity_eggs),r.id,`Cancelamento ${r.reservation_number}`)
    ]);return{success:true,newStatus:"cancelled",returnedEggs:Number(r.quantity_eggs)};
  }
  return{error:"Ação inválida",status:400};
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==="OPTIONS"&&url.pathname.startsWith("/api/pwa/"))return new Response(null,{status:204,headers:corsHeaders()});
    if(request.method==="GET"&&url.pathname==="/api/health")return json({success:true,service:"doslilinhos-website",database:"connected"});
    if(request.method==="GET"&&url.pathname==="/api/stock"){
      try{const p=await getStock(env);if(!p)return json({success:false,error:"Produto não encontrado"},404);const eggs=Math.max(0,Number(p.available_eggs||0));const pack=Number(p.units_per_pack||6);return json({success:true,product:{code:p.code,name:p.name,unitsPerPack:pack},stock:{availableEggs:eggs,availablePacks:Math.floor(eggs/pack),available:eggs>=pack},updatedAt:new Date().toISOString()});}catch(e){console.error(e);return json({success:false,error:"Não foi possível consultar o stock"},500);}
    }
    if(request.method==="POST"&&url.pathname==="/api/reservations"){
      try{const b=await request.json();const name=cleanText(b.name,100),email=cleanText(b.email).toLowerCase(),packs=Number(b.packs);if(name.length<2)return json({success:false,error:"Indique um nome válido"},400);if(!validEmail(email))return json({success:false,error:"Indique um email válido"},400);if(!Number.isInteger(packs)||packs<1||packs>50)return json({success:false,error:"Quantidade inválida"},400);const p=await getStock(env);if(!p)return json({success:false,error:"Produto não encontrado"},404);const units=Number(p.units_per_pack||6),qty=packs*units,available=Math.max(0,Number(p.available_eggs||0));if(qty>available)return json({success:false,error:"Já não existe stock suficiente",availablePacks:Math.floor(available/units)},409);const number=`DL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`,until=new Date(Date.now()+86400000).toISOString();await env.DB.batch([env.DB.prepare(`INSERT INTO reservations(reservation_number,product_id,customer_name,customer_email,packs,quantity_eggs,status,reserved_until) VALUES(?,?,?,?,?,?,'pending',?)`).bind(number,p.id,name,email,packs,qty,until),env.DB.prepare(`INSERT INTO inventory_movements(product_id,movement_type,quantity_eggs,reference_type,reference_id,notes) VALUES(?,'reservation',?,'reservation',(SELECT id FROM reservations WHERE reservation_number=?),?)`).bind(p.id,-qty,number,`Reserva ${number}`)]);return json({success:true,reservation:{number,packs,quantityEggs:qty,status:"pending",reservedUntil:until}},201);}catch(e){console.error(e);return json({success:false,error:"Não foi possível criar a reserva"},500);}
    }
    if(request.method==="GET"&&url.pathname==="/api/pwa/health"){
      if(!isPwa(request,env))return unauthorized(true);return json({success:true,service:"stock-pwa",connected:true},200,true);
    }
    if(request.method==="POST"&&url.pathname==="/api/pwa/collections"){
      if(!isPwa(request,env))return unauthorized(true);
      try{const b=await request.json();const externalId=cleanText(b.externalId,120),date=cleanText(b.date,10),species=cleanText(b.species,80),breed=cleanText(b.breed,100),groupId=cleanText(b.groupId,100),deviceId=cleanText(b.deviceId,120);const total=Number(b.total),lost=Number(b.lost||0);if(!externalId||!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({success:false,error:"Identificador ou data inválidos"},400,true);if(!Number.isInteger(total)||!Number.isInteger(lost)||total<0||lost<0||lost>total)return json({success:false,error:"Quantidades inválidas"},400,true);if(species.toLowerCase()!=="galinha")return json({success:false,error:"Apenas ovos de galinha alimentam o stock comercial"},400,true);const existing=await env.DB.prepare("SELECT external_id,eggs_commercial,synced_at FROM pwa_stock_sync WHERE external_id=?").bind(externalId).first();if(existing)return json({success:true,duplicate:true,externalId,commercialEggs:Number(existing.eggs_commercial),syncedAt:existing.synced_at},200,true);const commercial=total-lost,method=productionMethod(date),p=await env.DB.prepare("SELECT id FROM products WHERE code='OVOS-6' AND active=1").first();if(!p)return json({success:false,error:"Produto OVOS-6 não encontrado"},404,true);await env.DB.batch([env.DB.prepare(`INSERT INTO pwa_stock_sync(external_id,product_id,collection_date,production_method,eggs_collected,eggs_rejected,eggs_commercial,species,breed,group_id,device_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(externalId,p.id,date,method,total,lost,commercial,species,breed,groupId,deviceId),env.DB.prepare(`INSERT INTO stock_batches(product_id,collected_on,production_method,eggs_collected,eggs_rejected,notes) VALUES(?,?,?,?,?,?)`).bind(p.id,date,method,total,lost,`PWA ${externalId}`),env.DB.prepare(`INSERT INTO inventory_movements(product_id,movement_type,quantity_eggs,reference_type,reference_id,notes) VALUES(?,'collection',?,'pwa_collection',(SELECT id FROM pwa_stock_sync WHERE external_id=?),?)`).bind(p.id,commercial,externalId,`Recolha PWA ${externalId}`)]);return json({success:true,duplicate:false,externalId,commercialEggs:commercial,productionMethod:method},201,true);}catch(e){console.error(e);return json({success:false,error:"Não foi possível sincronizar a recolha"},500,true);}
    }
    if(request.method==="GET"&&url.pathname==="/api/admin/reservations"){
      if(!isAdmin(request,env))return unauthorized();try{const r=await listReservations(env);return json({success:true,reservations:r.results||[]});}catch(e){return json({success:false,error:"Não foi possível obter as reservas"},500);}
    }
    const action=url.pathname.match(/^\/api\/admin\/reservations\/(\d+)\/(confirm|complete|cancel)$/);
    if(request.method==="POST"&&action){if(!isAdmin(request,env))return unauthorized();try{const r=await changeReservationStatus(env,Number(action[1]),action[2]);if(r.error)return json({success:false,error:r.error},r.status);return json({success:true,...r});}catch(e){return json({success:false,error:"Não foi possível atualizar a reserva"},500);}}
    if(url.pathname.startsWith("/api/"))return json({success:false,error:"Endpoint não encontrado"},404);
    return env.ASSETS.fetch(request);
  }
};
