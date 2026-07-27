// =========================================================================================
// MÓDULO 1: CONFIGURACIÓN, LOGIN Y NAVEGACIÓN
// =========================================================================================
const SCRIPT_URL = 'TU_URL_DE_APPS_SCRIPT_AQUI'; // <-- IMPORTANTE: Pega aquí la nueva URL de tu script
let tokenSesion = localStorage.getItem('compukelc_token') || null;

// Variables globales para la vista de la app
let capturasEscaner = [];
let streamCamaraActual = null;
let formatoElegido = 'pdf';
let archivosEnCola = [];

// Funciones utilitarias para el DOM
const $ = (selector) => document.querySelector(selector);
const mostrarToast = (mensaje, tipo = 'exito') => {
  const toast = $('#toast');
  if(!toast) return;
  toast.textContent = mensaje;
  toast.className = '';
  toast.classList.add('mostrar', tipo);
  setTimeout(() => toast.classList.remove('mostrar', tipo), 3500);
};

const cambiarVista = (vistaId) => {
  document.querySelectorAll('.seccion').forEach(s => s.classList.add('oculto'));
  const target = $('#seccion-' + vistaId);
  if (target) target.classList.remove('oculto');
  
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('activo'));
  const btnActivo = document.querySelector(`.nav-item[data-vista="${vistaId}"]`);
  if (btnActivo) btnActivo.classList.add('activo');
};

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. SOLUCIÓN: Botón de visibilidad de contraseña
  const btnToggleClave = document.getElementById('btn-toggle-clave');
  const inputClave = document.getElementById('input-clave');
  
  if (btnToggleClave && inputClave) {
    btnToggleClave.addEventListener('click', function() {
      inputClave.type = inputClave.type === 'password' ? 'text' : 'password';
    });
  }

  // 2. Lógica de formulario de Login
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async function(e) {
      e.preventDefault(); 
      
      const usuario = document.getElementById('input-usuario').value;
      const clave = inputClave.value;
      const errorDiv = document.getElementById('login-error');
      const btnLogin = document.getElementById('btn-login');
      
      errorDiv.classList.add('oculto');
      btnLogin.disabled = true;
      btnLogin.textContent = 'Verificando credenciales...';
      
      try {
        const respuesta = await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'login', usuario: usuario, clave: clave })
        });
        
        const resultado = await respuesta.json();
        
        if (resultado.ok) {
          // Cambiar de vista
          document.getElementById('vista-login').classList.add('oculto');
          document.getElementById('vista-app').classList.remove('oculto');
          
          document.getElementById('chip-nombre').textContent = resultado.usuario.nombre;
          document.getElementById('chip-cargo').textContent = resultado.usuario.cargo;
          
          tokenSesion = resultado.token;
          
          if (document.getElementById('input-recordar').checked) {
            localStorage.setItem('usuario_guardado', usuario);
            localStorage.setItem('compukelc_token', tokenSesion);
          } else {
            localStorage.removeItem('usuario_guardado');
            localStorage.removeItem('compukelc_token');
          }
        } else {
          errorDiv.textContent = resultado.error;
          errorDiv.classList.remove('oculto');
        }
      } catch (error) {
        errorDiv.textContent = 'Fallo de conexión con el servidor.';
        errorDiv.classList.remove('oculto');
      } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = 'Iniciar sesión';
      }
    });
  }

  // Autocompletado de usuario
  const usuarioGuardado = localStorage.getItem('usuario_guardado');
  if (usuarioGuardado) {
    document.getElementById('input-usuario').value = usuarioGuardado;
    document.getElementById('input-recordar').checked = true;
  }
  
  // 3. Sistema de Navegación Lateral (Sidebar)
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const vista = btn.dataset.vista;
      if (vista) cambiarVista(vista);
    });
  });

  // Cierre de Sesión
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('compukelc_token');
      tokenSesion = null;
      document.getElementById('vista-app').classList.add('oculto');
      document.getElementById('vista-login').classList.remove('oculto');
      document.getElementById('input-clave').value = '';
    });
  }

  // Inicializar Escáner
  if (typeof configurarEventosEscaner === 'function') {
    configurarEventosEscaner();
  }
});


// =========================================================================================
// MÓDULO 2: ESCÁNER — cámara (móvil/webcam de PC) + generación de PDF multipágina
// =========================================================================================
function configurarEventosEscaner() {
  const btnAbrirCam = $('#btn-abrir-camara');
  if(btnAbrirCam) btnAbrirCam.addEventListener('click', abrirModalCamara);
  
  const btnCerrarCam = $('#btn-cerrar-camara');
  if(btnCerrarCam) btnCerrarCam.addEventListener('click', cerrarModalCamara);
  
  const btnTomarFoto = $('#btn-tomar-foto');
  if(btnTomarFoto) btnTomarFoto.addEventListener('click', tomarFotoDesdeCamara);
  
  const btnTerminarCaptura = $('#btn-terminar-captura');
  if(btnTerminarCaptura) btnTerminarCaptura.addEventListener('click', terminarCaptura);

  const btnEscanerAr = $('#btn-escaner-archivo');
  if(btnEscanerAr) btnEscanerAr.addEventListener('click', () => $('#input-escaner-archivo').click());
  
  const inputEscaner = $('#input-escaner-archivo');
  if (inputEscaner) {
    inputEscaner.addEventListener('change', (e) => {
      if(typeof agregarArchivos === 'function') agregarArchivos(Array.from(e.target.files));
      cambiarVista('subir');
      mostrarToast('Archivo(s) del escáner agregados. Elige carpeta y sube.', 'exito');
    });
  }

  const btnJpg = $('#btn-formato-jpg');
  if(btnJpg) btnJpg.addEventListener('click', () => elegirFormato('jpg'));
  
  const btnPdf = $('#btn-formato-pdf');
  if(btnPdf) btnPdf.addEventListener('click', () => elegirFormato('pdf'));
  
  const btnUnaPag = $('#btn-una-pagina');
  if(btnUnaPag) btnUnaPag.addEventListener('click', () => finalizarCapturaComoPdf(false));
  
  const btnMultiPag = $('#btn-varias-paginas');
  if(btnMultiPag) btnMultiPag.addEventListener('click', () => finalizarCapturaComoPdf(true));
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

      const etiquetaStr = (cam.label || '').toLowerCase();
      if (etiquetaStr.includes('back') || etiquetaStr.includes('environment') || etiquetaStr.includes('trasera')) {
        idCamaraPrincipal = cam.deviceId;
      }
    });

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
  if (typeof renderizarListaArchivos === 'function') renderizarListaArchivos();
  mostrarToast('Documento escaneado agregado. Elige carpeta y sube.', 'exito');
}

// -----------------------------------------------------------------------------------------
// PEGA AQUÍ DEBAJO LAS FUNCIONES RESTANTES DE TU APP (Si tienes módulos de subida/tabla)
// Ejemplo: agregarArchivos(), renderizarListaArchivos(), etc.
// -----------------------------------------------------------------------------------------
