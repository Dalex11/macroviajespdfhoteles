/* =========================================================================
   MacroViajes - Generador de documentos de reserva
   ========================================================================= */

const LS_HOTELS = 'mv_hotels_v1';
const LS_ITIN   = 'mv_itin_v1';

let HOTELS = [];
let ITIN   = {};

/* ---------------------------------------------------------------------- */
/* Bootstrap                                                              */
/* ---------------------------------------------------------------------- */
async function loadData(){
  const lsHotels = localStorage.getItem(LS_HOTELS);
  const lsItin   = localStorage.getItem(LS_ITIN);

  if(lsHotels){ HOTELS = JSON.parse(lsHotels); }
  else{
    try{ HOTELS = await (await fetch('data/hotels.json')).json(); }
    catch(e){ HOTELS = []; }
  }

  if(lsItin){ ITIN = JSON.parse(lsItin); }
  else{
    try{ ITIN = await (await fetch('data/itinerarios.json')).json(); }
    catch(e){ ITIN = {}; }
  }
  saveHotels(); saveItin();
}

function saveHotels(){ localStorage.setItem(LS_HOTELS, JSON.stringify(HOTELS)); }
function saveItin(){ localStorage.setItem(LS_ITIN, JSON.stringify(ITIN)); }

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------------------------------------------------------------------- */
/* Text helpers                                                           */
/* ---------------------------------------------------------------------- */
function titleCase(str){
  if(!str) return '';
  return str.toLowerCase().replace(/(^|\s|-|\/)([a-záéíóúñü])/g, (m,p1,p2)=> p1+p2.toUpperCase());
}
function upper(str){ return (str||'').toUpperCase(); }

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function parseDate(iso){
  // iso: yyyy-mm-dd  -> local Date at noon to avoid TZ shift issues
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d, 12,0,0);
}
function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate()+n);
  return d;
}
function fmtLongDate(date){
  return `${DIAS[date.getDay()]}, ${String(date.getDate()).padStart(2,'0')} de ${MESES[date.getMonth()]} de ${date.getFullYear()}`;
}
function fmtShortDate(date){
  return `${String(date.getDate()).padStart(2,'0')} DE ${MESES[date.getMonth()].toUpperCase()}`;
}
function nightsBetween(inDate, outDate){
  return Math.round((outDate-inDate)/(1000*60*60*24));
}
function randomConfirmation(len=10){
  let s='';
  for(let i=0;i<len;i++) s += Math.floor(Math.random()*10);
  return s;
}
function mdBold(text){
  return (text||'').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
}

/* ---------------------------------------------------------------------- */
/* Passenger classification                                               */
/* ---------------------------------------------------------------------- */
function classify(age){
  if(age>=13) return 'adulto';
  if(age>=3)  return 'nino';
  return 'infante'; // 0-2
}

function guestListHTML(passengers){
  // passengers: [{name, age}]
  const adults = passengers.filter(p=>classify(p.age)==='adulto');
  const ninos  = passengers.filter(p=>classify(p.age)==='nino');
  const infantes = passengers.filter(p=>classify(p.age)==='infante');
  const lines = [];

  adults.forEach((p,i)=>{
    const last = i===adults.length-1;
    lines.push(upper(p.name) + (last ? `, ${adults.length} adultos` : ','));
  });
  ninos.forEach(p=>{
    lines.push(`${upper(p.name)}, 1 niño de ${p.age} años`);
  });
  infantes.forEach(p=>{
    lines.push(`${upper(p.name)}, 1 infante`);
  });
  if(adults.length===0 && lines.length===0){
    return '';
  }
  return lines.join('<br>');
}

/* ---------------------------------------------------------------------- */
/* Room type + bed distribution                                           */
/* ---------------------------------------------------------------------- */
function roomConfig(paxCount){
  if(paxCount<=1) return {tipo:'Habitación Individual', camas:'1 cama individual'};
  if(paxCount===2) return {tipo:'Habitación Doble', camas:'1 cama doble'};
  const dobles = Math.floor(paxCount/2);
  const resto  = paxCount%2;
  let parts=[];
  if(dobles>0) parts.push(`${dobles} cama${dobles>1?'s':''} doble${dobles>1?'s':''}`);
  if(resto>0) parts.push('1 cama individual');
  return {tipo:'Habitación Familiar', camas: parts.join(' y ')};
}

/* ---------------------------------------------------------------------- */
/* Itinerary distribution across the whole trip                           */
/* ---------------------------------------------------------------------- */
function buildItinerary(stays){
  // stays: sorted array of {hotel, checkin(Date), checkout(Date)}
  // returns array of {date, dayNumber, kind:'transfer-in'|'transfer-out'|'transfer-city'|'activity'|'free', text, titulo}
  const totalStart = stays[0].checkin;
  const totalEnd   = stays[stays.length-1].checkout;
  const totalDays  = nightsBetween(totalStart, totalEnd) + 1;

  const days = [];
  for(let i=0;i<totalDays;i++){
    days.push({ date: addDays(totalStart,i), dayNumber:i+1, kind:'free', text:'', titulo:'' });
  }

  // mark day 0 = arrival, last day = final departure
  days[0].kind='transfer-in';
  days[0].titulo='Traslado Aeropuerto - Hotel';
  days[0].text='Traslado Aeropuerto Hotel. En autobús compartido totalmente dotado con guía habla hispana e inglés.';

  days[totalDays-1].kind='transfer-out';
  days[totalDays-1].titulo='Traslado Hotel - Aeropuerto';
  days[totalDays-1].text='Traslado hotel aeropuerto en autobús compartido para tomar vuelo con destino país de origen.\nEl traslado Hotel Aeropuerto, la hora se programará con el pasajero previamente en el hotel o al finalizar los recorridos.\n';

  // mark inter-hotel transfer days (checkout day of stay i == checkin day of stay i+1)
  let cursor = 0;
  stays.forEach((s,idx)=>{
    const startIdx = nightsBetween(totalStart, s.checkin);
    const endIdx   = nightsBetween(totalStart, s.checkout);
    if(idx>0){
      days[startIdx].kind='transfer-city';
      days[startIdx].titulo='Traslado a la siguiente ciudad';
      days[startIdx].text=`Traslado en autobús cómodamente dotado a la ciudad de ${titleCase(s.hotel.city)}.\nTarde libre para disfrutar de las instalaciones del hotel.`;
    }
    const availableDayIndexes = [];
    for(let d = startIdx + 1; d < endIdx; d++){
      if(days[d].kind === 'free'){
        availableDayIndexes.push(d);
      }
    }
    // assign activities in the OPEN interval (startIdx, endIdx) i.e days strictly between
    const pool = (ITIN[s.hotel.itineraryCity] || []).slice();
    const numActivities = Math.min(pool.length, availableDayIndexes.length);
    if (numActivities > 0) {
      const totalAvailableDays = availableDayIndexes.length;
      const step = (totalAvailableDays > 1 && numActivities > 1)
        ? (totalAvailableDays - 1) / (numActivities - 1)
        : 0;
      for (let i = 0; i < numActivities; i++) {
        const offsetIndex = Math.round(i * step);
        const targetDayIdx = availableDayIndexes[offsetIndex];

        const item = pool[i];
        days[targetDayIdx].kind = 'activity';
        days[targetDayIdx].titulo = item.titulo;
        days[targetDayIdx].text = item.cuerpo;
      }
    }
  });

  return days.filter(d=>d.kind!=='free' || true); // keep all, free days simply omitted from PDF rendering
}

/* ---------------------------------------------------------------------- */
/* HTML template builders (mirrors the original MacroViajes layout)       */
/* ---------------------------------------------------------------------- */
const LOGO_SRC = 'assets/logo.png';
const CHECK_SRC = 'assets/check.png';
const FOOTER_SRC = 'assets/footer.png';

function footerHTML(){
  return `
  <div class="doc-footer">
    <div class="foot-row">
      <img class="footcurve" src="${FOOTER_SRC}">
    </div>
  </div>`;
}
function headerHTML(){
  return `
  <div class="doc-header">
    <div>
      <img class="logo" src="${LOGO_SRC}">
    </div>
  </div>`;
}

function pageConfirmation(titularName, estado, hotel, checkin, checkout, noches, confirmNo){
  return `
  <div class="doc-page">
    ${headerHTML()}
    <div class="doc-banner">
      <img class="check" src="${CHECK_SRC}">
      <div class="banner-text"><b>${upper(titularName)}</b>, ${estado}</div>
    </div>
    <div class="doc-hotelblock">
      <div class="hinfo">
        <a>${titleCase(hotel.name)}</a>
        <div>${hotel.street}</div>
        <div>${titleCase(hotel.city)}</div>
        <div>${hotel.postalCode}</div>
        <div>${hotel.country}</div>
        <div>${hotel.phone}</div>
      </div>
      <img class="hphoto" src="${hotel.photo}">
    </div>
    <div class="doc-table">
      <div class="trow"><div class="lbl">Número de confirmación del Hotel</div><div class="val">${confirmNo}</div></div>
      <div class="trow"><div class="lbl">Check-in</div><div class="val">${fmtLongDate(checkin)} (${hotel.checkinRange}, hora local)</div></div>
      <div class="trow"><div class="lbl">Check-out</div><div class="val">${fmtLongDate(checkout)} (Antes de ${hotel.checkoutTime}, hora local)</div></div>
      <div class="trow"><div class="lbl">Tu estadía</div><div class="val">${noches} noches, 1 unidad</div></div>
    </div>
    <div class="doc-section-title">Información de la propiedad</div>
    <div class="doc-proplock">
      <a>${titleCase(hotel.name)}</a>
      <div>${hotel.street}, ${titleCase(hotel.city)}, ${hotel.postalCode}, ${hotel.country}</div>
      <div>Teléfono: ${hotel.phone}</div>
    </div>
    <div class="doc-req">
      <div class="lbl">Requisitos para hacer el check-in</div>
      <ul>${hotel.requisitos.map(r=>`<li>${r}</li>`).join('')}</ul>
    </div>
    ${footerHTML()}
  </div>`;
}

function amenityLine(label, val){
  if(!val) return '';
  return `<p><b>${label}:</b> ${val}</p>`;
}

function pageUnitDetail(hotel, roomCfg, noches, guestsHTML, prefText){
  const a = hotel.amenities||{};
  const breakfasts = noches;
  const dinners = hotel.mealsPolicy==='dinner-minus-one' ? Math.max(noches-1,0) : noches;
  return `
  <div class="doc-page">
    ${headerHTML()}
    <div class="doc-unit-title">Detalles de la unidad</div>
    <div class="doc-unit-sub">${roomCfg.tipo}</div>
    <div class="doc-field">
      <div class="lbl">Huéspedes</div>
      <div class="val">${guestsHTML}</div>
    </div>
    <div class="doc-field">
      <div class="lbl">Preferencias</div>
      <div class="val">
        ${prefText}
        <div class="doc-note"><b>Nota:</b> no se pueden garantizar las preferencias ni las solicitudes. Las solicitudes especiales dependen de la disponibilidad al momento de hacer el check-in y pueden dar lugar a cargos adicionales.</div>
      </div>
    </div>
    <div class="doc-field">
      <div class="lbl">Instalaciones</div>
      <div class="val doc-fac">
        <div class="doc-fac-title">WIFI GRATIS</div>
        <p><b>${breakfasts} Desayuno${breakfasts!==1?'s':''}, ${dinners} Cena${dinners!==1?'s':''} por persona</b></p>
        <p><b>${roomCfg.camas}</b></p>
        ${amenityLine('Internet', a.internet)}
        ${amenityLine('Alimentos y bebidas', a.alimentos)}
        ${amenityLine('Descanso', a.descanso)}
        ${amenityLine('Entretenimiento', a.entretenimiento)}
        ${amenityLine('Cuarto de baño', a.bano)}
        ${amenityLine('Información práctica', a.infoPractica)}
        ${amenityLine('Detalles prácticos', a.detallesPracticos)}
        ${amenityLine('Comodidades', a.comodidades)}
        ${amenityLine('Facilidades de acceso para discapacitados', a.accesoDiscapacitados)}
        ${amenityLine('Información importante', a.infoImportante)}
        <p>${a.fumadores||''}</p>
      </div>
    </div>
    ${footerHTML()}
  </div>`;
}

function pageItinerary(dayGroup, isFirstPage = false, isLastPage = false){
  // dayGroup: array of day objects (already filtered to non-free), max ~6 per page
  return `
  <div class="doc-page">
    ${headerHTML()}
    ${isFirstPage ? '<div class="doc-itin-title">EUROPA A TU MANERA</div>' : ''}
    ${dayGroup.map(d=>`
      <div class="doc-day">
        <h4>${fmtShortDate(d.date)}, DÍA ${String(d.dayNumber).padStart(2,'0')}</h4>
        <p>${mdBold(d.text)}</p>
      </div>
    `).join('')}
    ${isLastPage ? '<div class="doc-itin-end">FIN DEL RECORRIDO</div>' : ''}
    ${footerHTML()}
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Document generation                                                    */
/* ---------------------------------------------------------------------- */
function buildDocumentHTML(passengers, stays){
  const titular = passengers.slice().sort((a,b)=>b.age-a.age)[0];
  const roomCfg = roomConfig(passengers.length);
  const prefParts = [];
  prefParts.push('Para no fumadores');
  prefParts.push(roomCfg.camas);
  const prefText = prefParts.join(', ');
  const guestsHTML = guestListHTML(passengers);

  let pagesHTML = '';
  stays.forEach((s,idx)=>{
    const noches = nightsBetween(s.checkin, s.checkout);
    const estado = idx===0 ? 'tu reservación está garantizada.' : 'tu reservación está garantizada.';
    pagesHTML += pageConfirmation(titular.name, estado, s.hotel, s.checkin, s.checkout, noches, s.confirmNo);
    pagesHTML += pageUnitDetail(s.hotel, roomCfg, noches, guestsHTML, prefText);
  });

  // itinerary across the whole trip
  const allDays = buildItinerary(stays).filter(d=>d.kind!=='free');
  const perPage = 4;
  for(let i=0;i<allDays.length;i+=perPage){
    const isFirstPage = (i === 0);
    const isLastPage = (i + perPage >= allDays.length);
    pagesHTML += pageItinerary(allDays.slice(i, i + perPage), isFirstPage, isLastPage);
  }

  return { html: pagesHTML, titular };
}

function waitForImages(container){
  const imgs = Array.from(container.querySelectorAll('img'));
  return Promise.all(imgs.map(img=>{
    if(img.complete && img.naturalWidth>0) return Promise.resolve();
    return new Promise(resolve=>{
      img.addEventListener('load', resolve, {once:true});
      img.addEventListener('error', resolve, {once:true}); // don't block forever on a missing photo
    });
  }));
}

async function generatePDF(passengers, stays){
  const { html, titular } = buildDocumentHTML(passengers, stays);
  const overlay = document.getElementById('pdf-overlay');
  const root = document.getElementById('pdf-render-root');
  const msg = document.getElementById('pdf-overlay-msg');

  root.innerHTML = html;
  overlay.classList.add('show');
  msg.textContent = 'Cargando imágenes...';

  // The element must be genuinely visible on screen (not hidden via off-screen
  // positioning) or html2canvas can measure it with zero height and export a blank page.
  await waitForImages(root);
  // Let the browser finish layout/paint before capturing.
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const filename = upper(titular.name).trim().replace(/\s+/g,'_') + '.pdf';
  msg.textContent = 'Generando PDF...';

  const opt = {
    margin: 0,
    filename,
    image: { type:'jpeg', quality:0.98 },
    html2canvas: { scale:2, useCORS:true, allowTaint:true, logging:false },
    jsPDF: { unit:'in', format: 'letter', orientation:'portrait' }
  };

  // Render one canvas per .doc-page and add each as its own PDF page explicitly.
  // (html2pdf's automatic multi-page slicing of a single tall canvas is unreliable
  // and can insert blank pages between sections, so we drive pagination ourselves.)
  const pages = Array.from(root.querySelectorAll('.doc-page'));
  try{
    let worker = html2pdf().set(opt).from(pages[0]).toContainer().toCanvas().toPdf();
    for(let i=1;i<pages.length;i++){
      const page = pages[i];
      worker = worker.get('pdf').then(pdf=>{ pdf.addPage(); })
                      .from(page).toContainer().toCanvas().toPdf();
    }
    await worker.get('pdf').then(pdf=> pdf.save(filename));
    toast('Documento generado: ' + filename);
  } finally {
    overlay.classList.remove('show');
    root.innerHTML='';
  }
}

/* =========================================================================
   UI: Hoteles tab
   ========================================================================= */
function emptyHotel(){
  return {
    id: 'h_' + Date.now(),
    name:'', street:'', city:'', postalCode:'', country:'ES', phone:'',
    photo:'assets/sample-hotel-toledo.jpg',
    checkinRange:'15:00 - 23:00', checkoutTime:'11:00',
    mealsPolicy:'equal', itineraryCity:'',
    amenities:{ internet:'wifi gratis', alimentos:'servicio a la habitación', descanso:'ropa de cama', bano:'baño privado', infoPractica:'', comodidades:'aire acondicionado y servicio de limpieza diario', accesoDiscapacitados:'', infoImportante:'cunas o camas plegables/extra no disponibles', fumadores:'Para no fumadores', entretenimiento:'', detallesPracticos:'' },
    requisitos:[
      'Es obligatorio dejar un depósito en efectivo, con tarjeta de débito o con tarjeta de crédito para cubrir gastos imprevistos',
      'Es obligatorio presentar una identificación oficial válida',
      'La edad mínima para realizar el check-in es de 18 años.'
    ]
  };
}

let editingHotelId = null;

function renderHotelsTab(){
  const list = document.getElementById('hotelsList');
  list.innerHTML = HOTELS.map(h=>`
    <div class="row-item">
      <button class="btn small secondary" onclick="editHotel('${h.id}')">Editar</button>
      <button class="btn small danger" onclick="deleteHotel('${h.id}')" style="margin-left:6px;">Eliminar</button>
      <h3 style="margin-top:2px;">${titleCase(h.name)||'(sin nombre)'}</h3>
      <div class="muted">${h.street||''} · ${titleCase(h.city)||''} · ${h.postalCode||''} · ${h.country||''}</div>
      <div class="muted">Tel: ${h.phone||''} · Check-in ${h.checkinRange||''} · Check-out ${h.checkoutTime||''}</div>
      <div class="muted">Pool de itinerario asociado: <b>${h.itineraryCity||'(ninguno)'}</b></div>
    </div>
  `).join('') || '<p class="muted">Aún no hay hoteles. Agrega el primero abajo.</p>';

  const citySelect = document.getElementById('hotelItinCity');
  citySelect.innerHTML = Object.keys(ITIN).map(c=>`<option value="${c}">${c}</option>`).join('') + '<option value="">(otro / nuevo)</option>';
}

function editHotel(id){
  const h = HOTELS.find(x=>x.id===id);
  if(!h) return;
  editingHotelId = id;
  fillHotelForm(h);
  document.getElementById('hotelFormTitle').textContent = 'Editando: ' + titleCase(h.name);
  window.scrollTo({top:document.getElementById('hotelForm').offsetTop-20, behavior:'smooth'});
}
function deleteHotel(id){
  if(!confirm('¿Eliminar este hotel?')) return;
  HOTELS = HOTELS.filter(x=>x.id!==id);
  saveHotels(); renderHotelsTab(); renderStaysHotelOptions();
}
function fillHotelForm(h){
  document.getElementById('hName').value = h.name||'';
  document.getElementById('hStreet').value = h.street||'';
  document.getElementById('hCity').value = h.city||'';
  document.getElementById('hPostal').value = h.postalCode||'';
  document.getElementById('hCountry').value = h.country||'ES';
  document.getElementById('hPhone').value = h.phone||'';
  document.getElementById('hPhoto').value = h.photo||'';
  document.getElementById('hCheckin').value = h.checkinRange||'';
  document.getElementById('hCheckout').value = h.checkoutTime||'';
  document.getElementById('hMeals').value = h.mealsPolicy||'equal';
  document.getElementById('hotelItinCity').value = h.itineraryCity||'';
  document.getElementById('hItinNew').value='';
  const a = h.amenities||{};
  document.getElementById('aInternet').value=a.internet||'';
  document.getElementById('aAlimentos').value=a.alimentos||'';
  document.getElementById('aDescanso').value=a.descanso||'';
  document.getElementById('aEntretenimiento').value=a.entretenimiento||'';
  document.getElementById('aBano').value=a.bano||'';
  document.getElementById('aInfoPractica').value=a.infoPractica||'';
  document.getElementById('aDetallesPracticos').value=a.detallesPracticos||'';
  document.getElementById('aComodidades').value=a.comodidades||'';
  document.getElementById('aAcceso').value=a.accesoDiscapacitados||'';
  document.getElementById('aInfoImportante').value=a.infoImportante||'';
  document.getElementById('hRequisitos').value=(h.requisitos||[]).join('\n');
}
function clearHotelForm(){
  editingHotelId=null;
  fillHotelForm(emptyHotel());
  document.getElementById('hotelFormTitle').textContent='Nuevo hotel';
}
function saveHotelForm(){
  const newCity = document.getElementById('hItinNew').value.trim();
  const itinCity = newCity || document.getElementById('hotelItinCity').value;
  const h = {
    id: editingHotelId || ('h_'+Date.now()),
    name: document.getElementById('hName').value.trim(),
    street: document.getElementById('hStreet').value.trim(),
    city: document.getElementById('hCity').value.trim(),
    postalCode: document.getElementById('hPostal').value.trim(),
    country: document.getElementById('hCountry').value.trim()||'ES',
    phone: document.getElementById('hPhone').value.trim(),
    photo: document.getElementById('hPhoto').value.trim()||'assets/sample-hotel-toledo.jpg',
    checkinRange: document.getElementById('hCheckin').value.trim(),
    checkoutTime: document.getElementById('hCheckout').value.trim(),
    mealsPolicy: document.getElementById('hMeals').value,
    itineraryCity: itinCity,
    amenities:{
      internet: document.getElementById('aInternet').value.trim(),
      alimentos: document.getElementById('aAlimentos').value.trim(),
      descanso: document.getElementById('aDescanso').value.trim(),
      entretenimiento: document.getElementById('aEntretenimiento').value.trim(),
      bano: document.getElementById('aBano').value.trim(),
      infoPractica: document.getElementById('aInfoPractica').value.trim(),
      detallesPracticos: document.getElementById('aDetallesPracticos').value.trim(),
      comodidades: document.getElementById('aComodidades').value.trim(),
      accesoDiscapacitados: document.getElementById('aAcceso').value.trim(),
      infoImportante: document.getElementById('aInfoImportante').value.trim(),
      fumadores: 'Para no fumadores'
    },
    requisitos: document.getElementById('hRequisitos').value.split('\n').map(s=>s.trim()).filter(Boolean)
  };
  if(!h.name){ toast('Ponle un nombre al hotel'); return; }
  if(itinCity && !ITIN[itinCity]) { ITIN[itinCity]=[]; saveItin(); }

  if(editingHotelId){
    const idx = HOTELS.findIndex(x=>x.id===editingHotelId);
    HOTELS[idx]=h;
  } else {
    HOTELS.push(h);
  }
  saveHotels();
  clearHotelForm();
  renderHotelsTab();
  renderItinTab();
  renderStaysHotelOptions();
  toast('Hotel guardado');
}

function exportHotels(){ downloadJSON(HOTELS, 'hotels.json'); }
function importHotelsFile(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      if(!Array.isArray(data)) throw new Error('formato inválido');
      HOTELS = data; saveHotels(); renderHotelsTab(); renderStaysHotelOptions();
      toast('Hoteles importados');
    }catch(err){ alert('Archivo JSON inválido: '+err.message); }
  };
  reader.readAsText(file);
}

/* =========================================================================
   UI: Itinerarios tab
   ========================================================================= */
function renderItinTab(){
  const sel = document.getElementById('itinCitySelect');
  const current = sel.value;
  sel.innerHTML = Object.keys(ITIN).map(c=>`<option value="${c}">${c}</option>`).join('');
  if(Object.keys(ITIN).includes(current)) sel.value = current;
  renderItinActivities();
}
function renderItinActivities(){
  const city = document.getElementById('itinCitySelect').value;
  const box = document.getElementById('itinActivities');
  if(!city){ box.innerHTML='<p class="muted">Crea o selecciona un destino.</p>'; return; }
  const list = ITIN[city]||[];
  box.innerHTML = list.map((it,i)=>`
    <div class="row-item">
      <button class="btn small danger remove-btn" onclick="removeActivity('${city.replace(/'/g,"\\'")}',${i})">Eliminar</button>
      <b>${it.titulo}</b>
      <p style="white-space:pre-line;font-size:12.5px;color:#444;margin:6px 0 0;">${it.cuerpo}</p>
    </div>
  `).join('') || '<p class="muted">Sin actividades todavía.</p>';
}
function addCity(){
  const name = document.getElementById('newCityName').value.trim();
  if(!name) return;
  if(!ITIN[name]) ITIN[name]=[];
  saveItin();
  document.getElementById('newCityName').value='';
  renderItinTab();
  document.getElementById('itinCitySelect').value=name;
  renderItinActivities();
  renderHotelsTab();
  renderOtroCityOptions();
}
function deleteCity(){
  const city = document.getElementById('itinCitySelect').value;
  if(!city) return;
  if(!confirm(`¿Eliminar el destino "${city}" y todas sus actividades?`)) return;
  delete ITIN[city];
  saveItin(); renderItinTab(); renderHotelsTab();
  renderOtroCityOptions();
}
function addActivity(){
  const city = document.getElementById('itinCitySelect').value;
  if(!city){ toast('Selecciona un destino primero'); return; }
  const titulo = document.getElementById('actTitulo').value.trim();
  const cuerpo = document.getElementById('actCuerpo').value.trim();
  if(!titulo || !cuerpo){ toast('Completa título y descripción'); return; }
  ITIN[city].push({titulo, cuerpo});
  saveItin();
  document.getElementById('actTitulo').value='';
  document.getElementById('actCuerpo').value='';
  renderItinActivities();
}
function removeActivity(city, idx){
  ITIN[city].splice(idx,1);
  saveItin(); renderItinActivities();
}
function exportItin(){ downloadJSON(ITIN, 'itinerarios.json'); }
function importItinFile(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const data = JSON.parse(e.target.result);
      ITIN = data; saveItin(); renderItinTab(); renderHotelsTab();
      renderOtroCityOptions();
      toast('Itinerarios importados');
    }catch(err){ alert('Archivo JSON inválido: '+err.message); }
  };
  reader.readAsText(file);
}

function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* =========================================================================
   UI: Generar tab
   ========================================================================= */

/* Opción "Otro" del selector de hotel: reutiliza los datos fijos del hotel
   Agapo Home (id: agapo-home-toledo) y solo permite editar los campos de
   identidad del hotel (nombre, dirección, ciudad/itinerario, CP, país y teléfono). */
const AGAPO_HOME_FALLBACK = {
  photo:'assets/sample-hotel-toledo.jpg',
  checkinRange:'15:00 - 23:00',
  checkoutTime:'11:00',
  mealsPolicy:'equal',
  amenities:{
    internet:'wifi gratis',
    alimentos:'servicio a la habitación',
    descanso:'cortinas blackout',
    bano:'baño privado',
    infoPractica:'escritorio y plancha/tabla de planchar (previa solicitud); camas plegables/extra disponibles previa solicitud, y cunas gratuitas, también previa solicitud.',
    comodidades:'servicio de limpieza diario, petfriendly y sistemas de calefacción y aire acondicionado',
    accesoDiscapacitados:'acceso para silla de ruedas',
    infoImportante:'cunas o camas plegables/extra no disponibles',
    fumadores:'Para no fumadores',
    entretenimiento:'',
    detallesPracticos:''
  },
  requisitos:[
    'Es obligatorio dejar un depósito en efectivo, con tarjeta de débito o con tarjeta de crédito para cubrir gastos imprevistos',
    'Es obligatorio presentar una identificación oficial válida',
    'La edad mínima para realizar el check-in es de 18 años.'
  ]
};

function getAgapoTemplate(){
  const found = HOTELS.find(h=>h.id==='agapo-home-toledo');
  if(found){
    return {
      photo: 'assets/otro.jpg',
      checkinRange: found.checkinRange,
      checkoutTime: found.checkoutTime,
      mealsPolicy: found.mealsPolicy,
      amenities: Object.assign({}, found.amenities),
      requisitos: (found.requisitos||[]).slice()
    };
  }
  return JSON.parse(JSON.stringify(AGAPO_HOME_FALLBACK));
}

/* País según el destino/ciudad elegido en "Otro". Cubre los destinos que ya
   trae itinerarios.json; si aparece un destino nuevo que no está en este
   mapa, se usa España por defecto. */
const CITY_COUNTRIES = {
  'Toledo / Madrid':   { code:'ES', name:'España' },
  'Valencia':          { code:'ES', name:'España' },
  'A Coruña':          { code:'ES', name:'España' },
  'Sevilla':           { code:'ES', name:'España' },
  'Paris':             { code:'FR', name:'Francia' },
  'Palma de Mallorca': { code:'ES', name:'España' },
  'Brussels':          { code:'BE', name:'Bélgica' },
  'Málaga':            { code:'ES', name:'España' },
  'Tenerife':          { code:'ES', name:'España' },
  'Gran Canaria':      { code:'ES', name:'España' },
  'Ibiza':             { code:'ES', name:'España' },
  'Fuerteventura':     { code:'ES', name:'España' },
  'Lanzarote':         { code:'ES', name:'España' },
  'Alicante':          { code:'ES', name:'España' },
  'Barcelona':         { code:'ES', name:'España' },
  'Bilbao':            { code:'ES', name:'España' },
  'Pamplona':          { code:'ES', name:'España' },
  'Estambul':          { code:'TR', name:'Turquía' },
  'Tarragona':         { code:'ES', name:'España' },
  'México City':       { code:'MX', name:'México' },
  'Cancún':            { code:'MX', name:'México' },
  'Londres':           { code:'GB', name:'Reino Unido' }
};
const COUNTRY_OPTIONS = [
  { code:'ES', name:'España' },
  { code:'FR', name:'Francia' },
  { code:'IT', name:'Italia' },
  { code:'DE', name:'Alemania' },
  { code:'BE', name:'Bélgica' },
  { code:'TR', name:'Turquía' },
  { code:'MX', name:'México' },
  { code:'GB', name:'Reino Unido' }
];
function countryForCity(city){
  return (CITY_COUNTRIES[city] && CITY_COUNTRIES[city].code) || 'ES';
}

let passengerRows = 1;
let stayRows = 1;

function renderPassengerRows(){
  const box = document.getElementById('passengersBox');
  box.innerHTML='';
  for(let i=0;i<passengerRows;i++){
    box.insertAdjacentHTML('beforeend', `
      <div class="row-item" id="prow_${i}">
        ${passengerRows>1?`<button class="btn small danger remove-btn" onclick="removePassenger(${i})">Quitar</button>`:''}
        <div class="grid2">
          <div><label>Nombre completo</label><input type="text" id="pname_${i}" placeholder="Ej: Juan Pérez"></div>
          <div><label>Edad (años)</label><input type="number" id="page_${i}" min="0" max="110" placeholder="Ej: 34"></div>
        </div>
      </div>
    `);
  }
}
function addPassenger(){ passengerRows++; syncPassengerValues(); renderPassengerRows(); restorePassengerValues(); }
function removePassenger(i){
  syncPassengerValues();
  passengerCache.splice(i,1);
  passengerRows--;
  renderPassengerRows();
  restorePassengerValues();
}
let passengerCache = [];
function syncPassengerValues(){
  passengerCache = [];
  for(let i=0;i<passengerRows;i++){
    const n = document.getElementById('pname_'+i);
    const a = document.getElementById('page_'+i);
    if(n) passengerCache.push({name:n.value, age:a.value});
  }
}
function restorePassengerValues(){
  passengerCache.forEach((p,i)=>{
    const n = document.getElementById('pname_'+i);
    const a = document.getElementById('page_'+i);
    if(n){ n.value=p.name; a.value=p.age; }
  });
}

function renderStaysHotelOptions(){
  for(let i=0;i<stayRows;i++){
    const sel = document.getElementById('shotel_'+i);
    if(!sel) continue;
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- selecciona hotel --</option>'
      + HOTELS.map(h=>`<option value="${h.id}">${titleCase(h.name)} (${titleCase(h.city)})</option>`).join('')
      + '<option value="otro">Otro</option>';
    if(cur) sel.value = cur;
    sel.onchange = ()=> toggleOtroHotelFields(i);
    toggleOtroHotelFields(i);
  }
}
function toggleOtroHotelFields(i){
  const sel = document.getElementById('shotel_'+i);
  const box = document.getElementById('otroFields_'+i);
  if(!sel || !box) return;
  box.style.display = (sel.value==='otro') ? '' : 'none';
}
function renderOtroCityOptions(){
  const cities = Object.keys(ITIN);
  document.querySelectorAll('select[id^="ohCity_"]').forEach(sel=>{
    const cur = sel.value;
    const i = sel.id.replace('ohCity_','');
    sel.innerHTML = cities.length
      ? cities.map(c=>{return c==='Toledo / Madrid' ? `<option value="${c}">Madrid</option>` : `<option value="${c}">${c}</option>`}).join('')
      : '<option value=""></option>';
    if(cur && cities.includes(cur)) sel.value = cur;
    sel.onchange = ()=> syncOtroCountry(i);
    renderOtroCountrySelect(i);
    syncOtroCountry(i);
  });
}
function renderOtroCountrySelect(i){
  const sel = document.getElementById('ohCountry_'+i);
  if(!sel) return;
  sel.innerHTML = COUNTRY_OPTIONS.map(c=>`<option value="${c.code}">${c.name}</option>`).join('');
  sel.disabled = true; // el país se calcula automáticamente según la ciudad elegida
}
function syncOtroCountry(i){
  const citySel = document.getElementById('ohCity_'+i);
  const countrySel = document.getElementById('ohCountry_'+i);
  if(!citySel || !countrySel) return;
  countrySel.value = countryForCity(citySel.value);
}
function renderStayRows(){
  const box = document.getElementById('staysBox');
  box.innerHTML='';
  for(let i=0;i<stayRows;i++){
    box.insertAdjacentHTML('beforeend', `
      <div class="row-item" id="srow_${i}">
        ${stayRows>1?`<button class="btn small danger remove-btn" onclick="removeStay(${i})">Quitar</button>`:''}
        <div class="grid4">
          <div><label>Hotel</label><select id="shotel_${i}" required></select></div>
          <div><label>Check-in</label><input type="date" id="sin_${i}" required></div>
          <div><label>Check-out</label><input type="date" id="sout_${i}" required></div>
          <div><label>Número de confirmación</label><input type="text" id="sconf_${i}" placeholder="Ej: 0123456789" required></div>
        </div>
        <div class="grid2" id="otroFields_${i}" style="display:none;margin-top:10px;">
          <div><label>Nombre del hotel</label><input type="text" id="ohName_${i}" placeholder="Ej: Hotel Central"></div>
          <div><label>Ciudad</label><select id="ohCity_${i}"></select></div>
          <div><label>Dirección</label><input type="text" id="ohStreet_${i}" placeholder="Ej: Rue de Rivoli 10"></div>
          <div><label>Código postal</label><input type="text" id="ohPostal_${i}" placeholder="Ej: 75001"></div>
          <div><label>País (automático según ciudad)</label>
            <select id="ohCountry_${i}"></select>
          </div>
          <div><label>Teléfono</label><input type="text" id="ohPhone_${i}" placeholder="Ej: +33 1 23 45 67 89"></div>
        </div>
      </div>
    `);
  }
  renderStaysHotelOptions();
  renderOtroCityOptions();
}
function addStay(){ stayRows++; renderStayRows(); }
function removeStay(i){ stayRows--; renderStayRows(); }

function buildOtroHotel(i){
  const name = document.getElementById('ohName_'+i)?.value.trim();
  const street = document.getElementById('ohStreet_'+i)?.value.trim();
  const city = document.getElementById('ohCity_'+i)?.value || '';
  const postalCode = document.getElementById('ohPostal_'+i)?.value.trim();
  const country = document.getElementById('ohCountry_'+i)?.value || 'ES';
  const phone = document.getElementById('ohPhone_'+i)?.value.trim();
  const tpl = getAgapoTemplate();
  const var_city = city==='Toledo / Madrid' ? 'Madrid' : city;
  const foto = city==='Toledo / Madrid' ? 'assets/otro.jpg' : `assets/${city}.jpg`;
  return {
    id: 'otro_' + i + '_' + Date.now(),
    name, street, city: var_city, postalCode, country, phone,
    itineraryCity: city,
    photo: foto,
    checkinRange: tpl.checkinRange,
    checkoutTime: tpl.checkoutTime,
    mealsPolicy: tpl.mealsPolicy,
    amenities: tpl.amenities,
    requisitos: tpl.requisitos
  };
}

function readPassengersFromForm(){
  const list=[];
  for(let i=0;i<passengerRows;i++){
    const name = document.getElementById('pname_'+i)?.value.trim();
    const age = parseInt(document.getElementById('page_'+i)?.value,10);
    if(name && !isNaN(age)) list.push({name, age});
  }
  return list;
}
function readStaysFromForm(){
  const list=[];
  for(let i=0;i<stayRows;i++){
    const hid = document.getElementById('shotel_'+i)?.value;
    const cin = document.getElementById('sin_'+i)?.value;
    const cout = document.getElementById('sout_'+i)?.value;
    const conf = document.getElementById('sconf_'+i)?.value.trim();
    if(hid && cin && cout){
      const hotel = hid==='otro' ? buildOtroHotel(i) : HOTELS.find(h=>h.id===hid);
      list.push({ hotel, checkin: parseDate(cin), checkout: parseDate(cout), confirmNo: conf });
    }
  }
  list.sort((a,b)=>a.checkin-b.checkin);
  return list;
}

async function onGenerateClick(){
  const passengers = readPassengersFromForm();
  const stays = readStaysFromForm();
  if(passengers.length===0){ alert('Agrega al menos un pasajero con nombre y edad.'); return; }
  if(stays.length===0){ alert('Agrega al menos una estadía de hotel con fechas válidas.'); return; }
  for(const s of stays){
    if(s.checkout<=s.checkin){ alert('La fecha de check-out debe ser posterior al check-in.'); return; }
    if(!s.confirmNo){ alert('Completa el número de confirmación.'); return; }
    if(s.hotel.id.startsWith('otro_') && (!s.hotel.name || !s.hotel.city || !s.hotel.street || !s.hotel.postalCode || !s.hotel.phone || !s.hotel.itineraryCity)){
      alert('Completa todos los campos del hotel marcado como "Otro".'); return;
    }
  }
  const btn = document.getElementById('generateBtn');
  btn.disabled=true; btn.textContent='Generando...';
  try{
    await generatePDF(passengers, stays);
  }catch(e){
    console.error(e);
    alert('Ocurrió un error generando el PDF: '+e.message);
  }finally{
    btn.disabled=false; btn.textContent='Generar y descargar PDF';
  }
}

/* =========================================================================
   UI: Vuelos tab
   ========================================================================= */
const AIRLINES = [
  { name:'Avianca',    code:'AV' },
  { name:'LATAM',      code:'LA' },
  { name:'Air Europa', code:'UX' },
  { name:'Wingo',      code:'P5' },
  { name:'JetSmart',   code:'JA' },
  { name:'World2Fly',  code:'2W' },
  { name:'SATENA',     code:'9R' },
  { name:'Clic Air',   code:'VE' }
];

/* Base de aeropuertos: Colombia y España completos, principales de EE.UU.,
   México, Ecuador, Chile, Cuba, Francia, Alemania, Reino Unido, Portugal,
   resto de la Unión Europea y resto de América Latina. Agrupados por país
   y ordenados alfabéticamente dentro de cada país. */
const AIRPORTS = [
  // ------------------------- Colombia -------------------------
  { code:'ADZ', city:'San Andrés', country:'Colombia', tz:'America/Bogota' },
  { code:'APO', city:'Apartadó', country:'Colombia', tz:'America/Bogota' },
  { code:'BAQ', city:'Barranquilla', country:'Colombia', tz:'America/Bogota' },
  { code:'BGA', city:'Bucaramanga', country:'Colombia', tz:'America/Bogota' },
  { code:'BOG', city:'Bogotá', country:'Colombia', tz:'America/Bogota' },
  { code:'CLO', city:'Cali', country:'Colombia', tz:'America/Bogota' },
  { code:'CTG', city:'Cartagena', country:'Colombia', tz:'America/Bogota' },
  { code:'CUC', city:'Cúcuta', country:'Colombia', tz:'America/Bogota' },
  { code:'CZU', city:'Corozal / Sincelejo', country:'Colombia', tz:'America/Bogota' },
  { code:'EJA', city:'Barrancabermeja', country:'Colombia', tz:'America/Bogota' },
  { code:'EOH', city:'Medellín (Olaya Herrera)', country:'Colombia', tz:'America/Bogota' },
  { code:'EYP', city:'Yopal', country:'Colombia', tz:'America/Bogota' },
  { code:'FLA', city:'Florencia', country:'Colombia', tz:'America/Bogota' },
  { code:'IBE', city:'Ibagué', country:'Colombia', tz:'America/Bogota' },
  { code:'LET', city:'Leticia', country:'Colombia', tz:'America/Bogota' },
  { code:'MDE', city:'Medellín (Rionegro)', country:'Colombia', tz:'America/Bogota' },
  { code:'MTR', city:'Montería', country:'Colombia', tz:'America/Bogota' },
  { code:'MZL', city:'Manizales', country:'Colombia', tz:'America/Bogota' },
  { code:'NVA', city:'Neiva', country:'Colombia', tz:'America/Bogota' },
  { code:'PEI', city:'Pereira', country:'Colombia', tz:'America/Bogota' },
  { code:'PPN', city:'Popayán', country:'Colombia', tz:'America/Bogota' },
  { code:'PSO', city:'Pasto', country:'Colombia', tz:'America/Bogota' },
  { code:'PVA', city:'Providencia', country:'Colombia', tz:'America/Bogota' },
  { code:'RCH', city:'Riohacha', country:'Colombia', tz:'America/Bogota' },
  { code:'SJE', city:'San José del Guaviare', country:'Colombia', tz:'America/Bogota' },
  { code:'SMR', city:'Santa Marta', country:'Colombia', tz:'America/Bogota' },
  { code:'TCO', city:'Tumaco', country:'Colombia', tz:'America/Bogota' },
  { code:'UIB', city:'Quibdó', country:'Colombia', tz:'America/Bogota' },
  { code:'VUP', city:'Valledupar', country:'Colombia', tz:'America/Bogota' },
  { code:'VVC', city:'Villavicencio', country:'Colombia', tz:'America/Bogota' },

  // ------------------------- España -------------------------
  { code:'ABC', city:'Albacete', country:'España', tz:'Europe/Madrid' },
  { code:'ACE', city:'Lanzarote', country:'España', tz:'Atlantic/Canary' },
  { code:'AGP', city:'Málaga', country:'España', tz:'Europe/Madrid' },
  { code:'ALC', city:'Alicante-Elche', country:'España', tz:'Europe/Madrid' },
  { code:'BCN', city:'Barcelona', country:'España', tz:'Europe/Madrid' },
  { code:'BIO', city:'Bilbao', country:'España', tz:'Europe/Madrid' },
  { code:'BJZ', city:'Badajoz', country:'España', tz:'Europe/Madrid' },
  { code:'EAS', city:'San Sebastián', country:'España', tz:'Europe/Madrid' },
  { code:'FUE', city:'Fuerteventura', country:'España', tz:'Atlantic/Canary' },
  { code:'GMZ', city:'La Gomera', country:'España', tz:'Atlantic/Canary' },
  { code:'GRO', city:'Girona', country:'España', tz:'Europe/Madrid' },
  { code:'GRX', city:'Granada', country:'España', tz:'Europe/Madrid' },
  { code:'IBZ', city:'Ibiza', country:'España', tz:'Europe/Madrid' },
  { code:'LCG', city:'A Coruña', country:'España', tz:'Europe/Madrid' },
  { code:'LEI', city:'Almería', country:'España', tz:'Europe/Madrid' },
  { code:'LEN', city:'León', country:'España', tz:'Europe/Madrid' },
  { code:'LPA', city:'Las Palmas de Gran Canaria', country:'España', tz:'Atlantic/Canary' },
  { code:'IBZ', city:'Ibiza', country:'España', tz:'Europe/Madrid' },
  { code:'MAD', city:'Madrid (Barajas)', country:'España', tz:'Europe/Madrid' },
  { code:'MAH', city:'Menorca', country:'España', tz:'Europe/Madrid' },
  { code:'MLN', city:'Melilla', country:'España', tz:'Europe/Madrid' },
  { code:'ODB', city:'Córdoba', country:'España', tz:'Europe/Madrid' },
  { code:'OVD', city:'Asturias', country:'España', tz:'Europe/Madrid' },
  { code:'PMI', city:'Palma de Mallorca', country:'España', tz:'Europe/Madrid' },
  { code:'PNA', city:'Pamplona', country:'España', tz:'Europe/Madrid' },
  { code:'REU', city:'Reus', country:'España', tz:'Europe/Madrid' },
  { code:'RMU', city:'Región de Murcia (Corvera)', country:'España', tz:'Europe/Madrid' },
  { code:'SCQ', city:'Santiago de Compostela', country:'España', tz:'Europe/Madrid' },
  { code:'SDR', city:'Santander', country:'España', tz:'Europe/Madrid' },
  { code:'SLM', city:'Salamanca', country:'España', tz:'Europe/Madrid' },
  { code:'SPC', city:'La Palma', country:'España', tz:'Atlantic/Canary' },
  { code:'SVQ', city:'Sevilla', country:'España', tz:'Europe/Madrid' },
  { code:'TFN', city:'Tenerife Norte', country:'España', tz:'Atlantic/Canary' },
  { code:'TFS', city:'Tenerife Sur', country:'España', tz:'Atlantic/Canary' },
  { code:'VDE', city:'El Hierro', country:'España', tz:'Atlantic/Canary' },
  { code:'VGO', city:'Vigo', country:'España', tz:'Europe/Madrid' },
  { code:'VLC', city:'Valencia', country:'España', tz:'Europe/Madrid' },
  { code:'VLL', city:'Valladolid', country:'España', tz:'Europe/Madrid' },
  { code:'XRY', city:'Jerez de la Frontera', country:'España', tz:'Europe/Madrid' },
  { code:'ZAZ', city:'Zaragoza', country:'España', tz:'Europe/Madrid' },

  // --------------------- Estados Unidos (principales) ---------------------
  { code:'ATL', city:'Atlanta', country:'Estados Unidos', tz:'America/New_York' },
  { code:'AUS', city:'Austin', country:'Estados Unidos', tz:'America/Chicago' },
  { code:'BOS', city:'Boston', country:'Estados Unidos', tz:'America/New_York' },
  { code:'CLT', city:'Charlotte', country:'Estados Unidos', tz:'America/New_York' },
  { code:'DCA', city:'Washington (Reagan)', country:'Estados Unidos', tz:'America/New_York' },
  { code:'DEN', city:'Denver', country:'Estados Unidos', tz:'America/Denver' },
  { code:'DFW', city:'Dallas/Fort Worth', country:'Estados Unidos', tz:'America/Chicago' },
  { code:'DTW', city:'Detroit', country:'Estados Unidos', tz:'America/New_York' },
  { code:'EWR', city:'Nueva York (Newark)', country:'Estados Unidos', tz:'America/New_York' },
  { code:'FLL', city:'Fort Lauderdale', country:'Estados Unidos', tz:'America/New_York' },
  { code:'HNL', city:'Honolulu', country:'Estados Unidos', tz:'Pacific/Honolulu' },
  { code:'IAD', city:'Washington (Dulles)', country:'Estados Unidos', tz:'America/New_York' },
  { code:'IAH', city:'Houston', country:'Estados Unidos', tz:'America/Chicago' },
  { code:'JFK', city:'Nueva York (JFK)', country:'Estados Unidos', tz:'America/New_York' },
  { code:'LAS', city:'Las Vegas', country:'Estados Unidos', tz:'America/Los_Angeles' },
  { code:'LAX', city:'Los Ángeles', country:'Estados Unidos', tz:'America/Los_Angeles' },
  { code:'LGA', city:'Nueva York (LaGuardia)', country:'Estados Unidos', tz:'America/New_York' },
  { code:'MCO', city:'Orlando', country:'Estados Unidos', tz:'America/New_York' },
  { code:'MIA', city:'Miami', country:'Estados Unidos', tz:'America/New_York' },
  { code:'MSP', city:'Minneapolis', country:'Estados Unidos', tz:'America/Chicago' },
  { code:'ORD', city:'Chicago (O\u2019Hare)', country:'Estados Unidos', tz:'America/Chicago' },
  { code:'PHL', city:'Filadelfia', country:'Estados Unidos', tz:'America/New_York' },
  { code:'PHX', city:'Phoenix', country:'Estados Unidos', tz:'America/Phoenix' },
  { code:'SAN', city:'San Diego', country:'Estados Unidos', tz:'America/Los_Angeles' },
  { code:'SEA', city:'Seattle', country:'Estados Unidos', tz:'America/Los_Angeles' },
  { code:'SFO', city:'San Francisco', country:'Estados Unidos', tz:'America/Los_Angeles' },
  { code:'SJU', city:'San Juan (Puerto Rico)', country:'Estados Unidos', tz:'America/Puerto_Rico' },
  { code:'TPA', city:'Tampa', country:'Estados Unidos', tz:'America/New_York' },

  // --------------------------- México (principales) ---------------------------
  { code:'ACA', city:'Acapulco', country:'México', tz:'America/Mexico_City' },
  { code:'BJX', city:'León / Guanajuato (Bajío)', country:'México', tz:'America/Mexico_City' },
  { code:'CJS', city:'Ciudad Juárez', country:'México', tz:'America/Ojinaga' },
  { code:'CUL', city:'Culiacán', country:'México', tz:'America/Mazatlan' },
  { code:'CUN', city:'Cancún', country:'México', tz:'America/Cancun' },
  { code:'CZM', city:'Cozumel', country:'México', tz:'America/Cancun' },
  { code:'GDL', city:'Guadalajara', country:'México', tz:'America/Mexico_City' },
  { code:'HMO', city:'Hermosillo', country:'México', tz:'America/Hermosillo' },
  { code:'MEX', city:'Ciudad de México (Benito Juárez)', country:'México', tz:'America/Mexico_City' },
  { code:'MID', city:'Mérida', country:'México', tz:'America/Mexico_City' },
  { code:'MTY', city:'Monterrey', country:'México', tz:'America/Monterrey' },
  { code:'NLU', city:'Ciudad de México (Felipe Ángeles)', country:'México', tz:'America/Mexico_City' },
  { code:'OAX', city:'Oaxaca', country:'México', tz:'America/Mexico_City' },
  { code:'PVR', city:'Puerto Vallarta', country:'México', tz:'America/Bahia_Banderas' },
  { code:'QRO', city:'Querétaro', country:'México', tz:'America/Mexico_City' },
  { code:'SJD', city:'Los Cabos', country:'México', tz:'America/Mazatlan' },
  { code:'SLW', city:'Saltillo', country:'México', tz:'America/Monterrey' },
  { code:'TGZ', city:'Tuxtla Gutiérrez', country:'México', tz:'America/Mexico_City' },
  { code:'TIJ', city:'Tijuana', country:'México', tz:'America/Tijuana' },
  { code:'VER', city:'Veracruz', country:'México', tz:'America/Mexico_City' },
  { code:'ZIH', city:'Ixtapa / Zihuatanejo', country:'México', tz:'America/Mexico_City' },
  { code:'ZLO', city:'Manzanillo', country:'México', tz:'America/Mexico_City' },

  // ------------------------------ Ecuador ------------------------------
  { code:'CUE', city:'Cuenca', country:'Ecuador', tz:'America/Guayaquil' },
  { code:'GPS', city:'Galápagos (Baltra)', country:'Ecuador', tz:'Pacific/Galapagos' },
  { code:'GYE', city:'Guayaquil', country:'Ecuador', tz:'America/Guayaquil' },
  { code:'MEC', city:'Manta', country:'Ecuador', tz:'America/Guayaquil' },
  { code:'SNC', city:'San Cristóbal (Galápagos)', country:'Ecuador', tz:'Pacific/Galapagos' },
  { code:'UIO', city:'Quito', country:'Ecuador', tz:'America/Guayaquil' },

  // ------------------------------- Chile -------------------------------
  { code:'ANF', city:'Antofagasta', country:'Chile', tz:'America/Santiago' },
  { code:'CJC', city:'Calama (San Pedro de Atacama)', country:'Chile', tz:'America/Santiago' },
  { code:'IPC', city:'Isla de Pascua', country:'Chile', tz:'Pacific/Easter' },
  { code:'IQQ', city:'Iquique', country:'Chile', tz:'America/Santiago' },
  { code:'LSC', city:'La Serena', country:'Chile', tz:'America/Santiago' },
  { code:'PMC', city:'Puerto Montt', country:'Chile', tz:'America/Santiago' },
  { code:'PUQ', city:'Punta Arenas', country:'Chile', tz:'America/Santiago' },
  { code:'SCL', city:'Santiago', country:'Chile', tz:'America/Santiago' },
  { code:'ZAL', city:'Valdivia', country:'Chile', tz:'America/Santiago' },

  // -------------------------------- Cuba --------------------------------
  { code:'CFG', city:'Cienfuegos', country:'Cuba', tz:'America/Havana' },
  { code:'CMW', city:'Camagüey', country:'Cuba', tz:'America/Havana' },
  { code:'CYO', city:'Cayo Coco', country:'Cuba', tz:'America/Havana' },
  { code:'HAV', city:'La Habana', country:'Cuba', tz:'America/Havana' },
  { code:'HOG', city:'Holguín', country:'Cuba', tz:'America/Havana' },
  { code:'LCL', city:'Cayo Largo', country:'Cuba', tz:'America/Havana' },
  { code:'MZO', city:'Manzanillo', country:'Cuba', tz:'America/Havana' },
  { code:'SCU', city:'Santiago de Cuba', country:'Cuba', tz:'America/Havana' },
  { code:'SNU', city:'Santa Clara', country:'Cuba', tz:'America/Havana' },
  { code:'VRA', city:'Varadero', country:'Cuba', tz:'America/Havana' },

  // ------------------------------ Francia ------------------------------
  { code:'BIQ', city:'Biarritz', country:'Francia', tz:'Europe/Paris' },
  { code:'BOD', city:'Burdeos', country:'Francia', tz:'Europe/Paris' },
  { code:'CDG', city:'París (Charles de Gaulle)', country:'Francia', tz:'Europe/Paris' },
  { code:'LYS', city:'Lyon', country:'Francia', tz:'Europe/Paris' },
  { code:'MRS', city:'Marsella', country:'Francia', tz:'Europe/Paris' },
  { code:'NCE', city:'Niza', country:'Francia', tz:'Europe/Paris' },
  { code:'NTE', city:'Nantes', country:'Francia', tz:'Europe/Paris' },
  { code:'ORY', city:'París (Orly)', country:'Francia', tz:'Europe/Paris' },
  { code:'SXB', city:'Estrasburgo', country:'Francia', tz:'Europe/Paris' },
  { code:'TLS', city:'Toulouse', country:'Francia', tz:'Europe/Paris' },

  // ------------------------------ Alemania ------------------------------
  { code:'BER', city:'Berlín', country:'Alemania', tz:'Europe/Berlin' },
  { code:'CGN', city:'Colonia/Bonn', country:'Alemania', tz:'Europe/Berlin' },
  { code:'DUS', city:'Düsseldorf', country:'Alemania', tz:'Europe/Berlin' },
  { code:'FRA', city:'Fráncfort', country:'Alemania', tz:'Europe/Berlin' },
  { code:'HAJ', city:'Hannover', country:'Alemania', tz:'Europe/Berlin' },
  { code:'HAM', city:'Hamburgo', country:'Alemania', tz:'Europe/Berlin' },
  { code:'LEJ', city:'Leipzig', country:'Alemania', tz:'Europe/Berlin' },
  { code:'MUC', city:'Múnich', country:'Alemania', tz:'Europe/Berlin' },
  { code:'NUE', city:'Núremberg', country:'Alemania', tz:'Europe/Berlin' },
  { code:'STR', city:'Stuttgart', country:'Alemania', tz:'Europe/Berlin' },

  // ---------------------------- Reino Unido ----------------------------
  { code:'BHX', city:'Birmingham', country:'Reino Unido', tz:'Europe/London' },
  { code:'BRS', city:'Bristol', country:'Reino Unido', tz:'Europe/London' },
  { code:'EDI', city:'Edimburgo', country:'Reino Unido', tz:'Europe/London' },
  { code:'GLA', city:'Glasgow', country:'Reino Unido', tz:'Europe/London' },
  { code:'LGW', city:'Londres (Gatwick)', country:'Reino Unido', tz:'Europe/London' },
  { code:'LHR', city:'Londres (Heathrow)', country:'Reino Unido', tz:'Europe/London' },
  { code:'LPL', city:'Liverpool', country:'Reino Unido', tz:'Europe/London' },
  { code:'LTN', city:'Londres (Luton)', country:'Reino Unido', tz:'Europe/London' },
  { code:'MAN', city:'Mánchester', country:'Reino Unido', tz:'Europe/London' },
  { code:'STN', city:'Londres (Stansted)', country:'Reino Unido', tz:'Europe/London' },

  // ------------------------------ Portugal ------------------------------
  { code:'FAO', city:'Faro', country:'Portugal', tz:'Europe/Lisbon' },
  { code:'FNC', city:'Madeira (Funchal)', country:'Portugal', tz:'Atlantic/Madeira' },
  { code:'LIS', city:'Lisboa', country:'Portugal', tz:'Europe/Lisbon' },
  { code:'OPO', city:'Oporto', country:'Portugal', tz:'Europe/Lisbon' },
  { code:'PDL', city:'Azores (Ponta Delgada)', country:'Portugal', tz:'Atlantic/Azores' },
  { code:'PXO', city:'Porto Santo', country:'Portugal', tz:'Atlantic/Madeira' },

  // ------------------------ Unión Europea (otros) ------------------------
  { code:'AMS', city:'Ámsterdam', country:'Unión Europea (otros)', tz:'Europe/Amsterdam' },
  { code:'ARN', city:'Estocolmo', country:'Unión Europea (otros)', tz:'Europe/Stockholm' },
  { code:'ATH', city:'Atenas', country:'Unión Europea (otros)', tz:'Europe/Athens' },
  { code:'BRU', city:'Bruselas', country:'Unión Europea (otros)', tz:'Europe/Brussels' },
  { code:'BUD', city:'Budapest', country:'Unión Europea (otros)', tz:'Europe/Budapest' },
  { code:'CPH', city:'Copenhague', country:'Unión Europea (otros)', tz:'Europe/Copenhagen' },
  { code:'DUB', city:'Dublín', country:'Unión Europea (otros)', tz:'Europe/Dublin' },
  { code:'FCO', city:'Roma (Fiumicino)', country:'Unión Europea (otros)', tz:'Europe/Rome' },
  { code:'MXP', city:'Milán (Malpensa)', country:'Unión Europea (otros)', tz:'Europe/Rome' },
  { code:'NAP', city:'Nápoles', country:'Unión Europea (otros)', tz:'Europe/Rome' },
  { code:'PRG', city:'Praga', country:'Unión Europea (otros)', tz:'Europe/Prague' },
  { code:'VCE', city:'Venecia', country:'Unión Europea (otros)', tz:'Europe/Rome' },
  { code:'VIE', city:'Viena', country:'Unión Europea (otros)', tz:'Europe/Vienna' },
  { code:'WAW', city:'Varsovia', country:'Unión Europea (otros)', tz:'Europe/Warsaw' },

  // ------------------------ América Latina (otros) ------------------------
  { code:'AEP', city:'Buenos Aires (Aeroparque)', country:'América Latina (otros)', tz:'America/Argentina/Buenos_Aires' },
  { code:'AQP', city:'Arequipa', country:'América Latina (otros)', tz:'America/Lima' },
  { code:'ASU', city:'Asunción', country:'América Latina (otros)', tz:'America/Asuncion' },
  { code:'BSB', city:'Brasilia', country:'América Latina (otros)', tz:'America/Sao_Paulo' },
  { code:'CCS', city:'Caracas', country:'América Latina (otros)', tz:'America/Caracas' },
  { code:'CNF', city:'Belo Horizonte', country:'América Latina (otros)', tz:'America/Sao_Paulo' },
  { code:'COR', city:'Córdoba (Argentina)', country:'América Latina (otros)', tz:'America/Argentina/Buenos_Aires' },
  { code:'CUZ', city:'Cusco', country:'América Latina (otros)', tz:'America/Lima' },
  { code:'EZE', city:'Buenos Aires (Ezeiza)', country:'América Latina (otros)', tz:'America/Argentina/Buenos_Aires' },
  { code:'GIG', city:'Río de Janeiro (Galeão)', country:'América Latina (otros)', tz:'America/Sao_Paulo' },
  { code:'GRU', city:'São Paulo (Guarulhos)', country:'América Latina (otros)', tz:'America/Sao_Paulo' },
  { code:'GUA', city:'Ciudad de Guatemala', country:'América Latina (otros)', tz:'America/Guatemala' },
  { code:'LIM', city:'Lima', country:'América Latina (otros)', tz:'America/Lima' },
  { code:'LPB', city:'La Paz', country:'América Latina (otros)', tz:'America/La_Paz' },
  { code:'MDZ', city:'Mendoza', country:'América Latina (otros)', tz:'America/Argentina/Buenos_Aires' },
  { code:'MGA', city:'Managua', country:'América Latina (otros)', tz:'America/Managua' },
  { code:'MVD', city:'Montevideo', country:'América Latina (otros)', tz:'America/Montevideo' },
  { code:'PTY', city:'Panamá (Tocumen)', country:'América Latina (otros)', tz:'America/Panama' },
  { code:'PUJ', city:'Punta Cana', country:'América Latina (otros)', tz:'America/Santo_Domingo' },
  { code:'REC', city:'Recife', country:'América Latina (otros)', tz:'America/Sao_Paulo' },
  { code:'SAL', city:'San Salvador', country:'América Latina (otros)', tz:'America/El_Salvador' },
  { code:'SAP', city:'San Pedro Sula', country:'América Latina (otros)', tz:'America/Tegucigalpa' },
  { code:'SDQ', city:'Santo Domingo', country:'América Latina (otros)', tz:'America/Santo_Domingo' },
  { code:'SJO', city:'San José (Costa Rica)', country:'América Latina (otros)', tz:'America/Costa_Rica' },
  { code:'SSA', city:'Salvador de Bahía', country:'América Latina (otros)', tz:'America/Sao_Paulo' },
  { code:'TGU', city:'Tegucigalpa', country:'América Latina (otros)', tz:'America/Tegucigalpa' },
  { code:'VLN', city:'Valencia (Venezuela)', country:'América Latina (otros)', tz:'America/Caracas' },
  { code:'VVI', city:'Santa Cruz de la Sierra', country:'América Latina (otros)', tz:'America/La_Paz' }
];

function airportOptionsHTML(){
  const byCountry = {};
  AIRPORTS.forEach(a=>{
    if(!byCountry[a.country]) byCountry[a.country] = [];
    byCountry[a.country].push(a);
  });
  const countries = Object.keys(byCountry).sort((a,b)=>a.localeCompare(b,'es'));
  return countries.map(country=>{
    const airports = byCountry[country].slice().sort((a,b)=>a.city.localeCompare(b.city,'es'));
    const opts = airports.map(a=>`<option value="${a.code}">${a.city} (${a.code})</option>`).join('');
    return `<optgroup label="${country}">${opts}</optgroup>`;
  }).join('');
}
function airportByCode(code){
  return AIRPORTS.find(a=>a.code===code);
}

/* Duración de vuelo calculada correctamente cruzando husos horarios: convierte
   la hora local de salida (en el huso del aeropuerto de origen) y la hora local
   de llegada (en el huso del aeropuerto de destino) a un mismo instante UTC. */
function zoneOffsetMinutes(date, timeZone){
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName:'shortOffset' });
  const part = dtf.formatToParts(date).find(p=>p.type==='timeZoneName');
  if(!part) return 0;
  const m = part.value.match(/GMT([+-]\d+)(?::(\d+))?/);
  if(!m) return 0;
  const h = parseInt(m[1],10);
  const mi = m[2] ? parseInt(m[2],10) : 0;
  return (h<0 ? -1 : 1) * (Math.abs(h)*60 + mi);
}
function wallTimeToUTCms(y, mo, d, h, mi, timeZone){
  const guess = Date.UTC(y, mo-1, d, h, mi);
  const offsetMin = zoneOffsetMinutes(new Date(guess), timeZone);
  return guess - offsetMin*60000;
}
function computeFlightDurationMinutes(leg){
  if(!leg.orig?.tz || !leg.dest?.tz) return null;
  const dep = leg.depart, arr = leg.arrive;
  const departUTC = wallTimeToUTCms(dep.getFullYear(), dep.getMonth()+1, dep.getDate(), dep.getHours(), dep.getMinutes(), leg.orig.tz);
  const arriveUTC = wallTimeToUTCms(arr.getFullYear(), arr.getMonth()+1, arr.getDate(), arr.getHours(), arr.getMinutes(), leg.dest.tz);
  const minutes = Math.round((arriveUTC - departUTC)/60000);
  return minutes>=0 ? minutes : null;
}
function fmtDuration(totalMinutes){
  if(totalMinutes==null || isNaN(totalMinutes)) return '';
  const h = Math.floor(totalMinutes/60), m = totalMinutes%60;
  const parts = [];
  if(h>0) parts.push(`${h} hora${h!==1?'s':''}`);
  if(m>0) parts.push(`${m} minuto${m!==1?'s':''}`);
  return parts.join(' ') || '0 minutos';
}

function fmtFlightDateTime(dt){
  return `${DIAS[dt.getDay()]}, ${String(dt.getDate()).padStart(2,'0')} de ${MESES[dt.getMonth()]} de ${dt.getFullYear()} · ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
}

/* Clasificación y formato de pasajero: APELLIDOS/NOMBRE + código
   INF (menor de 2 años), CHD (menor de 11 años), MR (hombre, 11+), MRS (mujer, 11+) */
function passengerSuffix(edad, sexo){
  if(edad < 2) return 'INF';
  if(edad < 11) return 'CHD';
  return sexo === 'F' ? 'MRS' : 'MR';
}
function passengerDisplayName(p){
  return `${upper(p.apellidos)}/${upper(p.nombre)} ${passengerSuffix(p.edad, p.sexo)}`;
}

let flightPassengerRows = 1;
let flightLegRows = 1;
let flightPassengerCache = [];

function renderFlightPassengerRows(){
  const box = document.getElementById('flightPassengersBox');
  box.innerHTML='';
  for(let i=0;i<flightPassengerRows;i++){
    box.insertAdjacentHTML('beforeend', `
      <div class="row-item" id="fprow_${i}">
        ${flightPassengerRows>1?`<button class="btn small danger remove-btn" onclick="removeFlightPassenger(${i})">Quitar</button>`:''}
        <div class="grid2">
          <div><label>Apellidos</label><input type="text" id="fpApellidos_${i}" placeholder="Ej: Vides Villalobos"></div>
          <div><label>Nombre(s)</label><input type="text" id="fpNombre_${i}" placeholder="Ej: Hanna Sophia"></div>
        </div>
        <div class="grid2">
          <div><label>Sexo</label>
            <select id="fpSexo_${i}">
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </div>
          <div><label>Edad (años)</label><input type="number" id="fpEdad_${i}" min="0" max="110" placeholder="Ej: 5"></div>
        </div>
        <div class="grid2">
          <div><label>Asiento (opcional)</label><input type="text" id="fpAsiento_${i}" placeholder="Ej: 12A"></div>
          <div><label>Recibo de boleto electrónico (opcional)</label><input type="text" id="fpRecibo_${i}" placeholder="Ej: 1345230276952"></div>
        </div>
      </div>
    `);
  }
}
function addFlightPassenger(){ flightPassengerRows++; syncFlightPassengerValues(); renderFlightPassengerRows(); restoreFlightPassengerValues(); }
function removeFlightPassenger(i){
  syncFlightPassengerValues();
  flightPassengerCache.splice(i,1);
  flightPassengerRows--;
  renderFlightPassengerRows();
  restoreFlightPassengerValues();
}
function syncFlightPassengerValues(){
  flightPassengerCache = [];
  for(let i=0;i<flightPassengerRows;i++){
    const ap = document.getElementById('fpApellidos_'+i);
    if(!ap) continue;
    flightPassengerCache.push({
      apellidos: ap.value,
      nombre: document.getElementById('fpNombre_'+i)?.value || '',
      sexo: document.getElementById('fpSexo_'+i)?.value || 'F',
      edad: document.getElementById('fpEdad_'+i)?.value || '',
      asiento: document.getElementById('fpAsiento_'+i)?.value || '',
      recibo: document.getElementById('fpRecibo_'+i)?.value || ''
    });
  }
}
function restoreFlightPassengerValues(){
  flightPassengerCache.forEach((p,i)=>{
    const ap = document.getElementById('fpApellidos_'+i);
    if(!ap) return;
    ap.value = p.apellidos;
    document.getElementById('fpNombre_'+i).value = p.nombre;
    document.getElementById('fpSexo_'+i).value = p.sexo;
    document.getElementById('fpEdad_'+i).value = p.edad;
    document.getElementById('fpAsiento_'+i).value = p.asiento;
    document.getElementById('fpRecibo_'+i).value = p.recibo;
  });
}

function renderFlightAirlineOptions(){
  for(let i=0;i<flightLegRows;i++){
    const sel = document.getElementById('flAirline_'+i);
    if(!sel) continue;
    const cur = sel.value;
    sel.innerHTML = '<option value="">-- selecciona aerolínea --</option>' + AIRLINES.map(a=>`<option value="${a.code}">${a.name}</option>`).join('');
    if(cur) sel.value = cur;
  }
}
function renderFlightAirportOptions(){
  const html = airportOptionsHTML();
  for(let i=0;i<flightLegRows;i++){
    const origSel = document.getElementById('flOrig_'+i);
    const destSel = document.getElementById('flDest_'+i);
    if(origSel){ const cur=origSel.value; origSel.innerHTML = '<option value="">-- selecciona origen --</option>'+html; if(cur) origSel.value=cur; }
    if(destSel){ const cur=destSel.value; destSel.innerHTML = '<option value="">-- selecciona destino --</option>'+html; if(cur) destSel.value=cur; }
  }
}
function renderFlightLegRows(){
  const box = document.getElementById('flightLegsBox');
  box.innerHTML='';
  for(let i=0;i<flightLegRows;i++){
    box.insertAdjacentHTML('beforeend', `
      <div class="row-item" id="flrow_${i}">
        ${flightLegRows>1?`<button class="btn small danger remove-btn" onclick="removeFlightLeg(${i})">Quitar</button>`:''}
        <div class="grid2">
          <div><label>Aerolínea (obligatorio)</label><select id="flAirline_${i}" required></select></div>
          <div><label>Número de vuelo (solo el número)</label><input type="text" id="flNumber_${i}" placeholder="Ej: 9525"></div>
        </div>
        <div class="grid2">
          <div><label>Origen</label><select id="flOrig_${i}"></select></div>
          <div><label>Destino</label><select id="flDest_${i}"></select></div>
        </div>
        <div class="grid2">
          <div><label>Fecha y hora de salida</label><input type="datetime-local" id="flDepart_${i}"></div>
          <div><label>Fecha y hora de llegada</label><input type="datetime-local" id="flArrive_${i}"></div>
        </div>
        <div class="grid2">
          <div><label>Tipo de avión (opcional)</label><input type="text" id="flAircraft_${i}" placeholder="Ej: Airbus A320"></div>
          <div><label>Cabina (opcional)</label><input type="text" id="flCabin_${i}" placeholder="Ej: Turista"></div>
        </div>
        <div class="grid2">
          <div><label>Código de reserva (opcional)</label><input type="text" id="flResCode_${i}" placeholder="Ej: FSIRVY"></div>
          <div><label>N.º de reserva de la aerolínea (opcional)</label><input type="text" id="flAirlineRes_${i}" placeholder="Ej: B5U729"></div>
        </div>
        <label>Equipaje incluido (opcional, con peso máximo permitido)</label>
        <div class="grid3" style="margin-bottom:2px;align-items:end;">
          <div>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin-bottom:6px;"><input type="checkbox" id="flBagPersonal_${i}" style="width:auto;margin:0;">Artículo personal</label>
            <input type="number" id="flBagPersonalKg_${i}" min="0" step="0.5" value="5" placeholder="kg máx.">
          </div>
          <div>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin-bottom:6px;"><input type="checkbox" id="flBagCabin_${i}" style="width:auto;margin:0;">Equipaje de mano</label>
            <input type="number" id="flBagCabinKg_${i}" min="0" step="0.5" value="10" placeholder="kg máx.">
          </div>
          <div>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;margin-bottom:6px;"><input type="checkbox" id="flBagHold_${i}" style="width:auto;margin:0;">Equipaje de bodega</label>
            <input type="number" id="flBagHoldKg_${i}" min="0" step="0.5" value="23" placeholder="kg máx.">
          </div>
        </div>
      </div>
    `);
  }
  renderFlightAirlineOptions();
  renderFlightAirportOptions();
}
function addFlightLeg(){ flightLegRows++; renderFlightLegRows(); }
function removeFlightLeg(i){ flightLegRows--; renderFlightLegRows(); }

function readFlightPassengers(){
  const list=[];
  for(let i=0;i<flightPassengerRows;i++){
    const apellidos = document.getElementById('fpApellidos_'+i)?.value.trim();
    const nombre = document.getElementById('fpNombre_'+i)?.value.trim();
    const sexo = document.getElementById('fpSexo_'+i)?.value || 'F';
    const edadRaw = document.getElementById('fpEdad_'+i)?.value;
    const edad = parseInt(edadRaw, 10);
    const asiento = document.getElementById('fpAsiento_'+i)?.value.trim();
    const recibo = document.getElementById('fpRecibo_'+i)?.value.trim();
    if(apellidos && nombre && !isNaN(edad)){
      list.push({ apellidos, nombre, sexo, edad, asiento, recibo });
    }
  }
  return list;
}
function readFlightLegs(){
  const list=[];
  const incomplete = [];
  for(let i=0;i<flightLegRows;i++){
    const airlineCode = document.getElementById('flAirline_'+i)?.value;
    const airline = AIRLINES.find(a=>a.code===airlineCode);
    const number = document.getElementById('flNumber_'+i)?.value.trim();
    const origCode = document.getElementById('flOrig_'+i)?.value;
    const destCode = document.getElementById('flDest_'+i)?.value;
    const orig = airportByCode(origCode);
    const dest = airportByCode(destCode);
    const departRaw = document.getElementById('flDepart_'+i)?.value;
    const arriveRaw = document.getElementById('flArrive_'+i)?.value;
    const aircraft = document.getElementById('flAircraft_'+i)?.value.trim();
    const cabin = document.getElementById('flCabin_'+i)?.value.trim();
    const resCode = document.getElementById('flResCode_'+i)?.value.trim();
    const airlineRes = document.getElementById('flAirlineRes_'+i)?.value.trim();
    const bagPersonal = !!document.getElementById('flBagPersonal_'+i)?.checked;
    const bagCabin = !!document.getElementById('flBagCabin_'+i)?.checked;
    const bagHold = !!document.getElementById('flBagHold_'+i)?.checked;
    const bagPersonalKg = document.getElementById('flBagPersonalKg_'+i)?.value;
    const bagCabinKg = document.getElementById('flBagCabinKg_'+i)?.value;
    const bagHoldKg = document.getElementById('flBagHoldKg_'+i)?.value;

    const hasAnyData = airlineCode || number || origCode || destCode || departRaw || arriveRaw;
    if(!hasAnyData) continue;
    if(!airline || !number || !orig || !dest || !departRaw || !arriveRaw){
      incomplete.push(i+1);
      continue;
    }
    list.push({
      airline, number, orig, dest,
      depart: new Date(departRaw), arrive: new Date(arriveRaw),
      aircraft, cabin, resCode, airlineRes,
      baggage: {
        personal: bagPersonal, personalKg: bagPersonalKg,
        cabin: bagCabin, cabinKg: bagCabinKg,
        hold: bagHold, holdKg: bagHoldKg
      }
    });
  }
  return { legs: list, incomplete };
}

function flightRouteHTML(leg){
  return `
  <div class="doc-route">
    <div class="doc-route-pt">
      <div class="doc-route-code">${leg.orig.code}</div>
      <div class="doc-route-city">${upper(leg.orig.city)}, ${upper(leg.orig.country)}</div>
    </div>
    <div class="doc-route-arrow">&#10230;</div>
    <div class="doc-route-pt">
      <div class="doc-route-code">${leg.dest.code}</div>
      <div class="doc-route-city">${upper(leg.dest.city)}, ${upper(leg.dest.country)}</div>
    </div>
  </div>`;
}
function passengerFlightTableHTML(passengers){
  const showReceipts = passengers.some(p=>p.recibo);
  const thStyle = 'text-align:left;padding:8px;';
  const tdStyle = 'text-align:left;padding:8px;';
  let header = `<tr><th style="${thStyle}">Pasajero</th><th style="${thStyle}">Asiento</th>`;
  if(showReceipts) header += `<th style="${thStyle}">Recibo de boleto electrónico</th>`;
  header += '</tr>';
  const rows = passengers.map(p=>{
    let row = `<tr><td style="${tdStyle}">${passengerDisplayName(p)}</td><td style="${tdStyle}">${p.asiento || 'Sin asignar'}</td>`;
    if(showReceipts) row += `<td style="${tdStyle}">${p.recibo || '-'}</td>`;
    row += '</tr>';
    return row;
  }).join('');
  return `<table class="doc-flight-table" style="width:100%;border-collapse:collapse;">${header}${rows}</table>`;
}
function pageFlightLeg(leg, passengers, titularName){
  const bagItems = [];
  if(leg.baggage.personal) bagItems.push(`Artículo personal${leg.baggage.personalKg ? ` (máx. ${leg.baggage.personalKg} kg)` : ''}`);
  if(leg.baggage.cabin) bagItems.push(`Equipaje de mano${leg.baggage.cabinKg ? ` (máx. ${leg.baggage.cabinKg} kg)` : ''}`);
  if(leg.baggage.hold) bagItems.push(`Equipaje de bodega${leg.baggage.holdKg ? ` (máx. ${leg.baggage.holdKg} kg)` : ''}`);

  const durationTxt = fmtDuration(computeFlightDurationMinutes(leg));
  const isGuaranteed = !!leg.resCode && passengers.length>0 && passengers.every(p=>p.recibo);
  const estadoTxt = isGuaranteed ? 'tu vuelo está garantizado.' : 'tu vuelo está confirmado.';

  const rows = [];
  rows.push(`<div class="trow"><div class="lbl">Salida</div><div class="val">${fmtFlightDateTime(leg.depart)}</div></div>`);
  rows.push(`<div class="trow"><div class="lbl">Llegada</div><div class="val">${fmtFlightDateTime(leg.arrive)}</div></div>`);
  if(durationTxt) rows.push(`<div class="trow"><div class="lbl">Duración</div><div class="val">${durationTxt}</div></div>`);
  if(leg.aircraft) rows.push(`<div class="trow"><div class="lbl">Tipo de avión</div><div class="val">${leg.aircraft}</div></div>`);
  if(leg.cabin) rows.push(`<div class="trow"><div class="lbl">Cabina</div><div class="val">${leg.cabin}</div></div>`);
  if(leg.resCode) rows.push(`<div class="trow"><div class="lbl">Código de reserva</div><div class="val">${upper(leg.resCode)}</div></div>`);
  if(leg.airlineRes) rows.push(`<div class="trow"><div class="lbl">N.º de reserva de la aerolínea</div><div class="val">${upper(leg.airlineRes)} (${leg.airline.code})</div></div>`);

  return `
  <div class="doc-page">
    ${headerHTML()}
    <div class="doc-banner">
      <img class="check" src="${CHECK_SRC}">
      <div class="banner-text"><b>${upper(titularName)}</b>, ${estadoTxt}</div>
    </div>
    <div class="doc-hotelblock">
      <div class="hinfo" style="flex:1;">
        ${flightRouteHTML(leg)}
        <div class="doc-unit-sub" style="margin-top:16px;margin-bottom:0;">${upper(leg.airline.name)} · ${leg.airline.code} ${leg.number}</div>
      </div>
    </div>
    <div class="doc-table">${rows.join('')}</div>
    ${bagItems.length ? `
    <div class="doc-section-title">Equipaje incluido</div>
    <ul class="doc-baglist">${bagItems.map(b=>`<li>${b}</li>`).join('')}</ul>` : ''}
    <div class="doc-section-title">Pasajeros</div>
    ${passengerFlightTableHTML(passengers)}
    ${footerHTML()}
  </div>`;
}
function pagePoliticasCancelacion(){
  return `
  <div class="doc-page">
    ${headerHTML()}
    <div class="doc-unit-title" style="font-size:18px;">Política de Cancelaciones y reembolsos</div>
    <p>La posibilidad de modificar o cancelar una reserva depende de varios factores, como:</p>
    <div class="doc-req" style="margin-top:2px;">
      <ul style="flex:1;padding-left:18px;">
        <li><b>La política de cancelación del proveedor:</b> Cada proveedor, como aerolíneas, hoteles, empresas de alquiler de autos, etc., tiene sus propias políticas de cancelación. Algunas son más flexibles que otras.</li>
        <li><b>El tipo de tarifa que reservaste:</b> Las tarifas con descuento o promocionales suelen tener restricciones de modificación o cancelación.</li>
        <li><b>El tiempo que queda antes de la fecha de viaje:</b> Cuanto más cerca esté la fecha de viaje, menos probable es que puedas modificar o cancelar sin penalización.</li>
      </ul>
    </div>
    <p style="margin-top:18px;">En general, las opciones de modificación o cancelación pueden incluir:</p>
    <div class="doc-req" style="margin-top:2px;">
      <ul style="flex:1;padding-left:18px;">
        <li><b>Pagar una tarifa de penalización:</b> El monto de la tarifa varía según la política del proveedor y el tiempo que queda antes de la fecha de viaje.</li>
        <li><b>Cambiar la fecha o el destino de tu viaje:</b> Algunas veces puedes cambiar tu viaje sin pagar una tarifa de penalización, pero esto dependerá de la disponibilidad y las políticas del proveedor.</li>
        <li><b>Cancelar tu viaje y recibir un reembolso parcial o total:</b> El monto del reembolso dependerá de la política del proveedor y el tiempo que queda antes de la fecha de viaje.</li>
      </ul>
    </div>
    <p style="margin-top:18px;">Es importante tener en cuenta que:</p>
    <div class="doc-req" style="margin-top:2px;">
      <ul style="flex:1;padding-left:18px;">
        <li>Las políticas de modificación y cancelación pueden cambiar sin previo aviso.</li>
        <li>No siempre es posible modificar o cancelar una reserva sin penalización.</li>
      </ul>
    </div>
    <p style="margin-top:18px;"><b>Nota importante:</b> Es responsabilidad del pasajero revisar, antes de la emisión del tiquete, que toda la información registrada en su voucher sea correcta —nombres completos de los viajeros, itinerario, y ciudades y horarios de salida y llegada—. Cualquier inconsistencia debe reportarse a la agencia con anticipación; una vez emitido el tiquete no será posible corregirla, y la agencia no se hace responsable por inconvenientes derivados de datos incorrectos que no hayan sido notificados a tiempo.</p>
    ${footerHTML()}
  </div>`;
}
function buildFlightDocumentHTML(passengers, legs){
  const titular = passengers[0];
  let pagesHTML = '';
  legs.forEach(leg=>{
    pagesHTML += pageFlightLeg(leg, passengers, passengerDisplayName(titular));
  });
  pagesHTML += pagePoliticasCancelacion();
  return { html: pagesHTML, titular };
}
async function generateFlightPDF(passengers, legs){
  const { html, titular } = buildFlightDocumentHTML(passengers, legs);
  const overlay = document.getElementById('pdf-overlay');
  const root = document.getElementById('pdf-render-root');
  const msg = document.getElementById('pdf-overlay-msg');

  root.innerHTML = html;
  overlay.classList.add('show');
  msg.textContent = 'Cargando...';

  await waitForImages(root);
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

  const filename = 'Itinerario_vuelo_' + passengerDisplayName(titular).trim().replace(/\s+/g,'_').replace(/\//g,'-') + '.pdf';
  msg.textContent = 'Generando PDF...';

  const opt = {
    margin: 0,
    filename,
    image: { type:'jpeg', quality:0.98 },
    html2canvas: { scale:2, useCORS:true, allowTaint:true, logging:false },
    jsPDF: { unit:'in', format: 'letter', orientation:'portrait' }
  };

  const pages = Array.from(root.querySelectorAll('.doc-page'));
  try{
    let worker = html2pdf().set(opt).from(pages[0]).toContainer().toCanvas().toPdf();
    for(let i=1;i<pages.length;i++){
      const page = pages[i];
      worker = worker.get('pdf').then(pdf=>{ pdf.addPage(); })
                      .from(page).toContainer().toCanvas().toPdf();
    }
    await worker.get('pdf').then(pdf=> pdf.save(filename));
    toast('Tiquete generado: ' + filename);
  } finally {
    overlay.classList.remove('show');
    root.innerHTML='';
  }
}
async function onGenerateFlightClick(){
  const passengers = readFlightPassengers();
  const { legs, incomplete } = readFlightLegs();
  if(passengers.length===0){ alert('Agrega al menos un pasajero con apellidos, nombre y edad.'); return; }
  if(incomplete.length>0){
    alert(`Completa la aerolínea, el número de vuelo, origen, destino y fechas del trayecto ${incomplete.length>1?'#s':'#'} ${incomplete.join(', ')} (la aerolínea es obligatoria).`);
    return;
  }
  if(legs.length===0){ alert('Agrega al menos un trayecto completo (aerolínea, número de vuelo, origen, destino y fechas).'); return; }
  const btn = document.getElementById('generateFlightBtn');
  btn.disabled=true; btn.textContent='Generando...';
  try{
    await generateFlightPDF(passengers, legs);
  }catch(e){
    console.error(e);
    alert('Ocurrió un error generando el tiquete: '+e.message);
  }finally{
    btn.disabled=false; btn.textContent='Generar tiquete';
  }
}

/* =========================================================================
   Tabs
   ========================================================================= */
function switchTab(name){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.id==='panel-'+name));
}

/* =========================================================================
   Init
   ========================================================================= */
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadData();
  renderHotelsTab();
  clearHotelForm();
  renderItinTab();
  renderPassengerRows();
  renderStayRows();
  renderFlightPassengerRows();
  renderFlightLegRows();

  document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click', ()=>switchTab(b.dataset.tab)));
  document.getElementById('addPassengerBtn').addEventListener('click', addPassenger);
  document.getElementById('addStayBtn').addEventListener('click', addStay);
  document.getElementById('generateBtn').addEventListener('click', onGenerateClick);
  document.getElementById('addFlightPassengerBtn').addEventListener('click', addFlightPassenger);
  document.getElementById('addFlightLegBtn').addEventListener('click', addFlightLeg);
  document.getElementById('generateFlightBtn').addEventListener('click', onGenerateFlightClick);
  document.getElementById('saveHotelBtn').addEventListener('click', saveHotelForm);
  document.getElementById('newHotelBtn').addEventListener('click', clearHotelForm);
  document.getElementById('exportHotelsBtn').addEventListener('click', exportHotels);
  document.getElementById('importHotelsInput').addEventListener('change', importHotelsFile);
  document.getElementById('addCityBtn').addEventListener('click', addCity);
  document.getElementById('deleteCityBtn').addEventListener('click', deleteCity);
  document.getElementById('itinCitySelect').addEventListener('change', renderItinActivities);
  document.getElementById('addActivityBtn').addEventListener('click', addActivity);
  document.getElementById('exportItinBtn').addEventListener('click', exportItin);
  document.getElementById('importItinInput').addEventListener('change', importItinFile);
});
