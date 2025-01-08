document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('novedadForm');
  const hacerCollageCheckbox = document.getElementById('hacerCollage');
  const inputImagenes = document.querySelector('input[name="imagenes"]');
  const loadingOverlay = document.getElementById('loadingOverlay');

  form.addEventListener('submit', async function (event) {
    event.preventDefault(); // Prevenir envío del formulario hasta que se procese

    // Mostrar el overlay mientras se procesa el formulario
    loadingOverlay.classList.remove('hidden');

    // Obtener las imágenes
    const imagenes = inputImagenes.files;


    // Enviar las imágenes y datos del formulario al servidor
    const formData = new FormData(form);

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        swal('Novedad registrada con éxito');
        // Redirigir o limpiar el formulario según sea necesario
        cargarNovedades();
        document.getElementById("novedadForm").reset();

      } else {
        swal('Error al registrar la novedad');
      }
    } catch (error) {
      console.error('Error al enviar el formulario:', error);
      swal('Error en el registro');
    } finally {
      loadingOverlay.classList.add('hidden');
    }
  });

  const btnEnviar = document.querySelectorAll('.btn-enviar');

  btnEnviar.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modalEnviar');
      modal.classList.remove('hidden');
    });
  });

  document.getElementById('btnCancelar').addEventListener('click', () => {
    const modal = document.getElementById('modalEnviar');
    modal.classList.add('hidden');
  });

  // JavaScript para actualizar los puestos basados en el tipo de negocio seleccionado
  document.getElementById('tipoNegocio').addEventListener('change', function () {
    const tipoNegocioId = this.value;
    const puestoSelect = document.getElementById('puesto');

    // Habilitar el campo de puesto solo cuando se seleccione un tipo de negocio
    puestoSelect.disabled = !tipoNegocioId;
    if (!tipoNegocioId) {
      puestoSelect.innerHTML = '<option value="" disabled selected>Seleccione un Puesto</option>';
      return;
    }

    // Realizar una solicitud AJAX para obtener los puestos
    fetch(`/api/puestos?tipoNegocioId=${tipoNegocioId}`)
      .then(response => response.json())
      .then(puestos => {
        // Limpiar los puestos existentes
        puestoSelect.innerHTML = '<option value="" disabled selected>Seleccione un Puesto</option>';

        // Verificar si se recibieron puestos
        if (puestos.length > 0) {
          puestos.forEach(puesto => {
            const option = document.createElement('option');
            option.value = puesto.id_puesto;
            option.textContent = puesto.nombre_puesto;
            puestoSelect.appendChild(option);
          });
        } else {
          puestoSelect.innerHTML = '<option value="" disabled selected>No hay puestos disponibles</option>';
        }
      })
      .catch(error => {
        console.error('Error al obtener los puestos:', error);
        puestoSelect.innerHTML = '<option value="" disabled selected>No se pudieron cargar los puestos</option>';
      });
  });



  const cargarNovedades = async () => {
    // Obtener el filtro seleccionado (por defecto 'Novedades')
    const filtroSeleccionado = document.querySelector('.opcionFiltro.selected')?.textContent.trim() || 'Novedades';
    
    try {
      // Realizar la consulta dependiendo del filtro
      const response = await fetch(`/api/novedades?filtro=${filtroSeleccionado}`);
      const novedades = await response.json();
  
      console.log(novedades);
      const listaNovedades = document.getElementById('listaNovedades').querySelector('tbody');
      listaNovedades.innerHTML = ''; // Limpiar la tabla antes de agregar las nuevas filas
  
      // Mostrar las novedades en la tabla
      novedades.forEach(novedad => {
        const row = document.createElement('tr');
        const novedadFechaFormat = new Date(novedad.fecha).toLocaleDateString();
        row.innerHTML = `
          <td>${novedad.consecutivo}</td> 
          <td>${novedadFechaFormat}</td>
          <td>${novedad.hora}</td>
          <td>${novedad.operadorNombre}</td>
          <td>${novedad.nombre_negocio}</td>
          <td>${novedad.nombre_novedad}</td>
          <td>${novedad.nombre_puesto}</td>
          <td>${novedad.nivel}</td>
          <td>${novedad.novedad}</td>
          <td>${novedad.gestion}</td>
          <td>
            <button class="editar" data-id="${novedad.id_novedad}">Editar</button>
            <button class="eliminar" data-id="${novedad.id_novedad}">Eliminar</button>
            <button class="enviar" data-id="${novedad.id_novedad}">Enviar</button>
          </td>
        `;
        listaNovedades.appendChild(row);
      });
    } catch (error) {
      console.error('Error al cargar las novedades:', error);
      swal('Error al cargar las novedades');
    }
  };
   
  
  // Lógica para actualizar el filtro seleccionado
  const filtros = document.querySelectorAll('.opcionFiltro');
  filtros.forEach(filtro => {
    filtro.addEventListener('click', () => {
      // Marcar el filtro seleccionado
      filtros.forEach(f => f.classList.remove('selected'));
      filtro.classList.add('selected');
  
      // Recargar las novedades con el filtro seleccionado
      cargarNovedades();
    });
  });
  
  // Inicializar la carga de novedades al cargar la página
  document.addEventListener('DOMContentLoaded', () => {
    cargarNovedades();
  });
  


  cargarNovedades();



  document.addEventListener('DOMContentLoaded', () => {
    // Función para habilitar el formulario en modo edición
    const editarNovedad = (id) => {
      // Obtener los datos de la novedad
      fetch(`/api/novedad/${id}`)
        .then(response => response.json())
        .then(novedad => {
          // Llenar el formulario con los datos de la novedad
          document.getElementById('fecha').value = novedad.fecha;
          document.getElementById('hora').value = novedad.hora;
          document.getElementById('tipoNegocio').value = novedad.id_tipo_negocio;
          document.getElementById('puesto').value = novedad.id_puesto;
          document.getElementById('tipoNovedad').value = novedad.id_tipo_novedad;
          document.getElementById('nivelCriticidad').value = novedad.id_nivel;
          document.getElementById('descripcion').value = novedad.novedad;
          document.getElementById('gestion').value = novedad.gestion;

          // Cambiar el texto del botón
          document.querySelector('button[type="submit"]').textContent = 'Guardar Cambios';

          // Modificar el formulario para enviar la actualización
          const form = document.getElementById('novedadForm');
          form.action = `/actualizar-novedad/${id}`;
        });
    };



    // Agregar event listeners para los botones
    document.querySelectorAll('.editar').forEach(button => {
      button.addEventListener('click', (e) => editarNovedad(e.target.dataset.id));
    });


  });



  document.addEventListener('DOMContentLoaded', () => {

    const form = document.getElementById('novedadForm');
    const hacerCollageCheckbox = document.getElementById('hacerCollage');
    const inputImagenes = document.querySelector('input[name="imagenes"]');
    const loadingOverlay = document.getElementById('loadingOverlay');

    form.addEventListener('submit', async function (event) {
      event.preventDefault(); // Prevenir envío del formulario hasta que se procese

      // Mostrar el overlay mientras se procesa el formulario
      loadingOverlay.classList.remove('hidden');

      // Obtener las imágenes
      const imagenes = inputImagenes.files;


      // Enviar las imágenes y datos del formulario al servidor
      const formData = new FormData(form);

      // // Agregar las imágenes al FormData
      // for (let i = 0; i < imagenes.length; i++) {
      //   formData.append('imagenes', imagenes[i]); // Enviar las imágenes como archivos
      // }

      // Enviar el formulario con los datos procesados
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          swal('Novedad registrada con éxito');
          // Redirigir o limpiar el formulario según sea necesario
        } else {
          swal('Error al registrar la novedad');
        }
      } catch (error) {
        console.error('Error al enviar el formulario:', error);
        swal('Error en el registro');
      } finally {
        loadingOverlay.classList.add('hidden');
      }
    });

    const btnEnviar = document.querySelectorAll('.btn-enviar');

    btnEnviar.forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('modalEnviar');
        modal.classList.remove('hidden');
      });
    });

    document.getElementById('btnCancelar').addEventListener('click', () => {
      const modal = document.getElementById('modalEnviar');
      modal.classList.add('hidden');
    });

    // JavaScript para actualizar los puestos basados en el tipo de negocio seleccionado
    document.getElementById('tipoNegocio').addEventListener('change', function () {
      const tipoNegocioId = this.value;
      const puestoSelect = document.getElementById('puesto');

      // Habilitar el campo de puesto solo cuando se seleccione un tipo de negocio
      puestoSelect.disabled = !tipoNegocioId;
      if (!tipoNegocioId) {
        puestoSelect.innerHTML = '<option value="" disabled selected>Seleccione un Puesto</option>';
        return;
      }

      // Realizar una solicitud AJAX para obtener los puestos
      fetch(`/api/puestos?tipoNegocioId=${tipoNegocioId}`)
        .then(response => response.json())
        .then(puestos => {
          // Limpiar los puestos existentes
          puestoSelect.innerHTML = '<option value="" disabled selected>Seleccione un Puesto</option>';

          // Verificar si se recibieron puestos
          if (puestos.length > 0) {
            puestos.forEach(puesto => {
              const option = document.createElement('option');
              option.value = puesto.id_puesto;
              option.textContent = puesto.nombre_puesto;
              puestoSelect.appendChild(option);
            });
          } else {
            puestoSelect.innerHTML = '<option value="" disabled selected>No hay puestos disponibles</option>';
          }
        })
        .catch(error => {
          console.error('Error al obtener los puestos:', error);
          puestoSelect.innerHTML = '<option value="" disabled selected>No se pudieron cargar los puestos</option>';
        });
    });






  });



});




document.addEventListener('DOMContentLoaded', () => {
  const cargarCorreos = async () => {
    const tipoNegocio = document.getElementById('tipoNegocio').value;
    const puesto = document.getElementById('puesto').value;
    const tipoNovedad = document.getElementById('tipoNovedad').value;

    if (tipoNegocio && puesto && tipoNovedad) {
      try {
        const response = await fetch(`/api/correos?tipoNegocio=${tipoNegocio}&puesto=${puesto}&tipoNovedad=${tipoNovedad}`);
        const correos = await response.json();

        const destinatariosContainer = document.getElementById('destinatarios');
        destinatariosContainer.innerHTML = ''; // Limpiar el contenedor

        // Validar que la respuesta sea un array
        if (Array.isArray(correos) && correos.length > 0) {
          const destinatariosList = correos.map(c => {
            return `<span class="correo" onclick="mostrarDetallesDestinatario('${c.nombre}', '${c.destinatario}', '${c.correo}')" data-nombre="${c.nombre}" data-cargo="${c.cargo}" data-correo="${c.correo}" style="border-radius: 15px; background-color: #f0f0f0; padding: 5px; margin: 5px; display: inline-block;">${c.nombre} <${c.correo}></span>`;
          }).join(', ');

          destinatariosContainer.innerHTML = destinatariosList;
        } else {
          // Si no hay correos, mostrar un mensaje
          destinatariosContainer.innerHTML = '<span class="destinatarios-placeholder">No hay destinatarios, notificar para revisar.</span>';
        }
      } catch (error) {
        console.error('Error al cargar los correos:', error);
        swal('Error al cargar los correos.');
      }
    } else {
      // Si no hay filtros seleccionados, limpiar el contenedor
      document.getElementById('destinatarios').innerHTML = '<span class="destinatarios-placeholder"></span>';
    }
  };

  // Función para mostrar los detalles de un destinatario
  window.mostrarDetallesDestinatario = (nombre, cargo, correo) => {
    const modal = document.getElementById('modalEnviar');
    const listaDestinatarios = document.getElementById('listaDestinatarios');
    listaDestinatarios.innerHTML = `<li>${nombre} (${cargo}) - ${correo}</li>`;

    modal.classList.remove('hidden');
  };

  // Event listeners para actualizar los correos
  document.getElementById('tipoNegocio').addEventListener('change', cargarCorreos);
  document.getElementById('puesto').addEventListener('change', cargarCorreos);
  document.getElementById('tipoNovedad').addEventListener('change', cargarCorreos);



  document.getElementById('btnCancelar').addEventListener('click', () => {
    document.getElementById('modalEnviar').classList.add('hidden');
  });

  // Cargar correos al cargar la página
  cargarCorreos();


});





// CSS para la superposición
const style = document.createElement("style");
style.textContent = `
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: black;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
    z-index: 99;
  }

  .body-content {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
    z-index: 100;
  }
`;
document.head.appendChild(style);

const destinatariosListContainer = document.getElementById('destinatarios');
if (!destinatariosListContainer) {
  console.error("El elemento con ID 'destinatarios' no existe en el DOM.");
} else {
  console.log("Elemento encontrado:", destinatariosListContainer);
}



document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById("modal-novedades"); // Modal de la novedad
  const overlay = document.createElement("div");
  overlay.classList.add("overlay");
  document.body.appendChild(overlay);

  // Contenedor de imágenes a actualizar
  const imagenesContainer = document.getElementById("imagenes");

  // Contenedor de destinatarios
  const destinatariosContainer = document.getElementById("destinatarios");

  // Función para cargar los correos basados en los datos de la novedad
  const cargarCorreos2 = async () => {
    const tipoNegocio = document.getElementById("tipoNegocio").value;
    const puesto = document.getElementById("puesto").value;
    const tipoNovedad = document.getElementById("tipoNovedad").value;

    console.log("Probando datos: ", tipoNegocio, puesto, tipoNovedad);

    if (tipoNegocio && puesto && tipoNovedad) {
      try {
        const response = await fetch(`/api/correos?tipoNegocio=${tipoNegocio}&puesto=${puesto}&tipoNovedad=${tipoNovedad}`);
        const correos = await response.json();

        const destinatariosListContainer = document.getElementById("destinatarios");
        destinatariosListContainer.innerHTML = ""; // Limpiar el contenedor de destinatarios

        if (Array.isArray(correos) && correos.length > 0) {
          // Crear la lista de destinatarios en formato HTML
          let destinatariosList = "";
          correos.forEach((correo) => {
            destinatariosList += `
              <li>
                <span class="nombre">${correo.nombre}</span>
                <span class="correo">${correo.correo}</span>
              </li>`;
          });

          destinatariosListContainer.innerHTML = destinatariosList; // Asignar los correos al contenedor
        } else {
          destinatariosListContainer.innerHTML = `
            <li>
              <span class="destinatarios-placeholder">No hay destinatarios, notificar para revisar.</span>
            </li>`;
        }
      } catch (error) {
        console.error("Error al cargar los correos:", error);
        swal("Error al cargar los correos.");
      }
    } else {
      document.getElementById("destinatarios").innerHTML = `
        <li>
          <span class="destinatarios-placeholder">Seleccione los datos para ver los destinatarios.</span>
        </li>`;
    }
  };


  // Capturamos el evento de clic en el botón para obtener los correos
document.querySelectorAll('.enviar').forEach(button => {
  button.addEventListener('click', async function() {
    const idNovedad = this.getAttribute('data-id');  // Obtener el id_novedad
    try {
      // Realizamos la consulta para obtener los correos asociados a esta novedad
      const response = await fetch(`/api/obtenerCorreosPorNovedad?idNovedad=${idNovedad}`);
      const correos = await response.json();

      if (correos.length > 0) {
        // Mostrar los correos en el HTML (ejemplo de cómo hacerlo)
        const destinatariosContainer = document.getElementById('destinatarios2');
        destinatariosContainer.innerHTML = '';  // Limpiamos el contenedor

        correos.forEach(correo => {
          const li = document.createElement('li');
          li.textContent = correo.nombre;

          const spanCorreo = document.createElement('span');
          spanCorreo.textContent = correo.correo;
          li.appendChild(spanCorreo);

          destinatariosContainer.appendChild(li);
        });
      } else {
        alert('No se encontraron destinatarios para esta novedad.');
      }
    } catch (error) {
      console.error('Error al obtener los correos:', error);
      alert('Hubo un error al obtener los correos.');
    }
  });
});

// Abrir el modal al hacer clic en el botón "Enviar"
document.addEventListener("click", async (event) => {
  if (event.target.classList.contains("enviar")) {
    const idNovedad = event.target.getAttribute("data-id");

    // Mostrar el modal y la superposición
    modal.style.opacity = "1";
    modal.style.visibility = "visible";
    overlay.style.opacity = "0.5";
    overlay.style.visibility = "visible";

    try {
      // Solicitar los datos de la novedad al servidor
      const response = await fetch(`/api/novedades/${idNovedad}`);
      if (response.ok) {
        const data = await response.json();
        console.log("Datos de la novedad recibidos:", data);

        // Llenar los datos en el modal
        if (document.getElementById("fechaN")) {
          document.getElementById("fechaN").textContent = `${data.fecha} - ${data.hora}`;
        }
        if (document.getElementById("puestoN")) {
          document.getElementById("puestoN").textContent = data.nombre_puesto;
        }
        if (document.getElementById("consecutivo")) {
          document.getElementById("consecutivo").textContent = data.consecutivo;
        }
        if (document.getElementById("tipoDeEvento")) {
          document.getElementById("tipoDeEvento").textContent = data.tipo_novedad;
        }
        if (document.getElementById("novedad")) {
          document.getElementById("novedad").textContent = data.novedad;
        }
        if (document.getElementById("gestions")) {
          document.getElementById("gestions").textContent = data.gestion;
        }

        // Limpiar y actualizar las imágenes usando innerHTML
        const imagenes = data.imagen_url.split(";"); // Separar las imágenes por ";"
        const imagenesHtml = imagenes
          .map((imagen) => {
            if (imagen.trim()) {
              return `<img class="emal-img" src="./img/sega-img/${imagen.trim()}" alt="Imagen de novedad ${idNovedad}" />`;
            }
            return "";
          })
          .join(""); // Unir todas las etiquetas img en un solo string

        imagenesContainer.innerHTML = imagenesHtml; // Asignar las imágenes al contenedor

        // Cargar los destinatarios basados en los datos de la novedad
        const destinatariosResponse = await fetch(`/api/obtenerCorreosPorNovedad?idNovedad=${idNovedad}`);
        const destinatarios = await destinatariosResponse.json();
        const destinatariosContainer = document.getElementById('destinatarios2');
        destinatariosContainer.innerHTML = ''; // Limpiamos los destinatarios previos

        destinatarios.forEach(correo => {
          const li = document.createElement('li');
          li.textContent = correo.nombre;

          const spanCorreo = document.createElement('span');
          spanCorreo.textContent =  " " +  correo.correo;
          li.appendChild(spanCorreo);

          destinatariosContainer.appendChild(li);
        });
        
      } else {
        console.error("Error al obtener los datos de la novedad");
      }
    } catch (error) {
      console.error("Error en la solicitud:", error);
    }
  }
});

// Cerrar el modal al hacer clic en "Cancelar"
document.addEventListener("click", (event) => {
  if (event.target.id === "modal-novedades-cancel-btn") {
    modal.style.opacity = "0";
    modal.style.visibility = "hidden";
    overlay.style.opacity = "0";
    overlay.style.visibility = "hidden";
  }
});

});
