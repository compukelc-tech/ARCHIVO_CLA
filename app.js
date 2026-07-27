// =========================================================================================
// 5. MÓDULO ESCÁNER — cámara (móvil/webcam de PC) + generación de PDF multipágina
// =========================================================================================
function configurarEventosEscaner() {
  $('#btn-abrir-camara').addEventListener('click', abrirModalCamara);
  $('#btn-cerrar-camara').addEventListener('click', cerrarModalCamara);
  $('#btn-tomar-foto').addEventListener('click', tomarFotoDesdeCamara);
  $('#btn-terminar-captura').addEventListener('click', terminarCaptura);

  $('#btn-escaner-archivo').addEventListener('click', () => $('#input-escaner-archivo').click());
  $('#input-escaner-archivo').addEventListener('change', (e) => {
    agregarArchivos(Array.from(e.target.files));
    cambiarVista('subir');
    mostrarToast('Archivo(s) del escáner agregados. Elige carpeta y sube.', 'exito');
  });

  $('#btn-formato-jpg').addEventListener('click', () => elegirFormato('jpg'));
  $('#btn-formato-pdf').addEventListener('click', () => elegirFormato('pdf'));
  $('#btn-una-pagina').addEventListener('click', () => finalizarCapturaComoPdf(false));
  $('#btn-varias-paginas').addEventListener('click', () => finalizarCapturaComoPdf(true));
}

async function abrirModalCamara() {
  capturasEscaner = [];
  $('#miniaturas-captura').innerHTML = '';
  $('#modal-camara').classList.remove('oculto');

  try {
    const dispositivos = await navigator.mediaDevices.enumerateDevices();
    const camaras = dispositivos.filter((d) => d.kind === 'videoinput');
    const select = $('#select-camara');
    select.innerHTML = '';
    
    let idCamaraPrincipal = null;

    camaras.forEach((cam, i) => {
      const opcion = document.createElement('option');
      opcion.value = cam.deviceId;
      opcion.textContent = cam.label || ('Cámara ' + (i + 1));
      select.appendChild(opcion);

      // LÓGICA DE CORRECCIÓN: Filtrar para autoseleccionar la cámara trasera o "main"
      const etiquetaStr = (cam.label || '').toLowerCase();
      if (etiquetaStr.includes('back') || etiquetaStr.includes('environment') || etiquetaStr.includes('trasera')) {
        idCamaraPrincipal = cam.deviceId;
      }
    });

    // Si no encontró por palabra clave, suele ser la última en móviles
    if (!idCamaraPrincipal && camaras.length > 1) {
        idCamaraPrincipal = camaras[camaras.length - 1].deviceId;
    } else if (!idCamaraPrincipal && camaras.length === 1) {
        idCamaraPrincipal = camaras[0].deviceId;
    }

    if (idCamaraPrincipal) {
        select.value = idCamaraPrincipal;
    }

    select.addEventListener('change', () => iniciarStreamCamara(select.value));

    await iniciarStreamCamara(idCamaraPrincipal);
  } catch (e) {
    mostrarToast('No se pudo acceder a la cámara. Usa "Cargar desde software del escáner".', 'error');
  }
}

async function iniciarStreamCamara(deviceId) {
  detenerStreamCamara();
  const restricciones = {
    // Si pasamos ID estricto lo respeta, si no asume 'environment' nativo del browser
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
  };
  try {
      streamCamaraActual = await navigator.mediaDevices.getUserMedia(restricciones);
      $('#video-escaner').srcObject = streamCamaraActual;
  } catch (err) {
      mostrarToast('Error al iniciar cámara seleccionada', 'error');
  }
}

function detenerStreamCamara() {
  if (streamCamaraActual) {
    streamCamaraActual.getTracks().forEach((t) => t.stop());
    streamCamaraActual = null;
  }
}

function cerrarModalCamara() {
  detenerStreamCamara();
  $('#modal-camara').classList.add('oculto');
}

function tomarFotoDesdeCamara() {
  const video = $('#video-escaner');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  capturasEscaner.push(dataUrl);

  const img = document.createElement('img');
  img.src = dataUrl;
  $('#miniaturas-captura').appendChild(img);
}

function terminarCaptura() {
  if (capturasEscaner.length === 0) {
    mostrarToast('Toma al menos una foto antes de continuar', 'error');
    return;
  }
  cerrarModalCamara();
  $('#modal-formato').classList.remove('oculto');
}

function elegirFormato(formato) {
  formatoElegido = formato;
  $('#modal-formato').classList.add('oculto');

  if (formato === 'jpg') {
    guardarCapturasComoJpg();
  } else {
    if (capturasEscaner.length > 1) {
      $('#modal-paginas').classList.remove('oculto');
    } else {
      finalizarCapturaComoPdf(false);
    }
  }
}

function guardarCapturasComoJpg() {
  capturasEscaner.forEach((dataUrl, i) => {
    const base64 = dataUrl.split(',')[1];
    archivosEnCola.push({
      id: 'scan' + Date.now() + i,
      nombre: 'escaneo_' + Date.now() + '_' + (i + 1) + '.jpg',
      base64,
      mime: 'image/jpeg',
      peso: Math.round(base64.length * 0.75),
      estado: 'pendiente'
    });
  });
  finalizarFlujoEscaneo();
}

function finalizarCapturaComoPdf(variasPaginas) {
  $('#modal-paginas').classList.add('oculto');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'pt' });

  const paginas = variasPaginas ? capturasEscaner : [capturasEscaner[0]];

  paginas.forEach((dataUrl, i) => {
    if (i > 0) pdf.addPage();
    const propiedades = pdf.getImageProperties(dataUrl);
    const anchoPagina = pdf.internal.pageSize.getWidth();
    const altoPagina = (propiedades.height * anchoPagina) / propiedades.width;
    pdf.addImage(dataUrl, 'JPEG', 0, 0, anchoPagina, altoPagina);
  });

  const base64Pdf = pdf.output('datauristring').split(',')[1];
  archivosEnCola.push({
    id: 'scanpdf' + Date.now(),
    nombre: 'escaneo_' + Date.now() + '.pdf',
    base64: base64Pdf,
    mime: 'application/pdf',
    peso: Math.round(base64Pdf.length * 0.75),
    estado: 'pendiente'
  });

  finalizarFlujoEscaneo();
}

function finalizarFlujoEscaneo() {
  capturasEscaner = [];
  cambiarVista('subir');
  renderizarListaArchivos();
  mostrarToast('Documento escaneado agregado. Elige carpeta y sube.', 'exito');
}
