# Generador de documentos MacroViajes

Aplicación web estática (sin backend) para generar, con un clic, los documentos de reserva
de hotel + itinerario ("EUROPA A TU MANERA") con el mismo diseño de las plantillas originales
de MacroViajes, lista para publicarse en **GitHub Pages**.

## 1. Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado con GitHub Pro/Team).
2. Sube **todo el contenido de esta carpeta** (`index.html`, `css/`, `js/`, `data/`, `assets/`) a la raíz del repositorio.
3. Ve a **Settings → Pages**, selecciona la rama `main` y la carpeta `/ (root)`.
4. Guarda. En 1-2 minutos tu app estará disponible en `https://tu-usuario.github.io/tu-repo/`.

No necesitas ningún servidor, base de datos ni build step: todo corre en el navegador.

## 2. Cómo funciona

### Pestaña "Hoteles"
Aquí guardas la ficha de cada hotel (nombre, dirección, teléfono, foto, horarios de
check-in/check-out, instalaciones, requisitos y a qué "pool" de itinerario pertenece). Se
guarda en el `localStorage` del navegador y puede exportarse/importarse como `hoteles.json`
para respaldar o compartir la información entre computadores.

### Pestaña "Itinerarios"
Aquí guardas, por destino (por ejemplo "Toledo / Madrid" o "Valencia"), la lista de
actividades disponibles ("Tour del Bernabéu", "Museo del Prado", etc.). Cada hotel apunta a
uno de estos destinos. Usa `**texto**` dentro de la descripción para poner una palabra en
**negrita**, igual que en los documentos originales.

### Pestaña "Generar documento"
1. Agrega los pasajeros (nombre completo + edad). El pasajero de mayor edad será
   automáticamente el **titular** de la reserva (el nombre que aparece grande arriba de cada
   documento y que se usa como nombre del archivo PDF).
2. Agrega uno o más hoteles con sus fechas de check-in/check-out (para viajes con varias
   ciudades, agrega una fila por hotel; el orden se ajusta solo según la fecha).
3. Da clic en **"Generar y descargar PDF"**. Se descargará un único PDF con:
   - Una página de confirmación + una página de "Detalles de la unidad" por cada hotel.
   - Las páginas del itinerario "EUROPA A TU MANERA", repartidas automáticamente entre las
     fechas del viaje.

## 3. Reglas de automatización ya incorporadas

- **Tipo de habitación y camas** según cantidad de huéspedes:
  - 1 huésped → *Habitación Individual*, 1 cama individual.
  - 2 huéspedes → *Habitación Doble*, 1 cama doble.
  - 3+ huéspedes → *Habitación Familiar*, con camas dobles para cada pareja de huéspedes y
    una cama individual si sobra un huésped impar (ej. 3 → 1 doble + 1 individual; 4 → 2
    dobles; 5 → 2 dobles + 1 individual).
- **Clasificación de pasajeros**: 13 años o más = adulto · 3 a 12 años = niño (se muestra
  "1 niño de X años") · 0 a 2 años = infante.
- **Listado de huéspedes** en "Detalles de la unidad": todos los adultos se listan primero
  (el total "N adultos" se agrega al final del último adulto), y luego cada niño/infante en
  su propia línea, tal como en las plantillas originales.
- **Mayúsculas/minúsculas**: los nombres de pasajeros siempre se muestran en MAYÚSCULAS; los
  nombres de hoteles se normalizan a "Cada Palabra Con Mayúscula Inicial".
- **Nombre del archivo**: nombre completo del titular en mayúsculas, con espacios
  reemplazados por guion bajo (ej. `VICTOR_MANUEL_ESCOBAR_SALAZAR.pdf`).
- **Reparto del itinerario**: el primer y el último día del viaje completo siempre son de
  traslado (aeropuerto-hotel / hotel-aeropuerto); si hay más de un hotel, el día de cambio de
  ciudad también se marca como traslado. Las actividades del "pool" del destino se reparten
  en los días restantes dejando **como mínimo un día libre entre cada actividad**, tomándolas
  en el orden en que están cargadas en la pestaña "Itinerarios".
- **Comidas**: por defecto, desayunos = cenas = número de noches. Si el hotel tiene marcada
  la política "Cenas = noches - 1", se resta una cena (útil para reproducir hoteles como
  *Coroa Malvarrosa* en el ejemplo original).

## 4. Estructura de los archivos JSON

`data/hotels.json` — arreglo de hoteles:

```json
{
  "id": "identificador-unico",
  "name": "Nombre del hotel",
  "street": "Dirección",
  "city": "Ciudad",
  "postalCode": "45001",
  "country": "ES",
  "phone": "+34 000 00 00 00",
  "photo": "assets/mi-foto.jpg",
  "checkinRange": "15:00 - 23:00",
  "checkoutTime": "11:00",
  "mealsPolicy": "equal | dinner-minus-one",
  "itineraryCity": "Nombre del destino en itinerarios.json",
  "amenities": { "internet": "...", "alimentos": "...", "...": "..." },
  "requisitos": ["...", "..."]
}
```

`data/itinerarios.json` — objeto por destino:

```json
{
  "Nombre del destino": [
    { "titulo": "Título corto", "cuerpo": "Descripción completa, admite **negrita**." }
  ]
}
```

Ambos archivos se cargan una sola vez como datos iniciales; después de eso, la app trabaja
sobre lo guardado en el navegador (`localStorage`). Usa los botones **Exportar/Importar JSON**
de cada pestaña para respaldar tus cambios o para precargar datos en otro equipo (puedes
incluso reemplazar `data/hotels.json` y `data/itinerarios.json` en el repositorio con tus
propios datos para que sean los valores por defecto de todos los usuarios).

## 5. Fotos de hoteles

El campo "foto" de cada hotel puede ser una ruta relativa a un archivo dentro de `assets/`
(agrégalo al repositorio) o una URL pública a una imagen. Se muestra recortada a 255×144 px
igual que en las plantillas originales.

## 6. Notas técnicas

- El PDF se genera 100% en el navegador con [html2pdf.js](https://github.com/eKoopmans/html2pdf.js),
  incluido localmente en `vendor/html2pdf.bundle.min.js` (no depende de ningún CDN externo, así
  que funciona incluso sin conexión a internet una vez publicada la página).
- Cada página del documento (confirmación, detalles de la unidad, itinerario) se captura y se
  agrega al PDF **por separado**, una por una. Esto es intencional: la paginación automática
  de html2pdf (cuando se le pasa todo el documento junto) resultó no ser confiable e insertaba
  páginas en blanco o con contenido duplicado entre secciones. Si en el futuro modificas
  `generatePDF()` en `js/app.js`, conviene mantener este patrón de "un `.doc-page` = una
  página del PDF" en vez de dejar que la librería corte automáticamente un lienzo largo.
- Antes de capturar cada página, la app espera a que todas las imágenes (logo, foto del hotel,
  pie de página) terminen de cargar, y muestra brevemente el documento en una vista previa en
  pantalla (en vez de ocultarlo fuera de la pantalla) porque `html2canvas` puede medir el alto
  de un elemento como 0 si está completamente oculto con posicionamiento extremo, lo que
  produce PDFs en blanco.
- Los logotipos y el pie de página (`assets/logo.png`, `assets/check.png`, `assets/footer.png`)
  son los mismos gráficos usados en las plantillas originales de MacroViajes; no deben
  modificarse si quieres conservar la identidad visual exacta.
