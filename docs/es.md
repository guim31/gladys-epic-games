# Epic Games Store

Cada semana, la Epic Games Store regala uno o varios juegos de PC, que conserva para siempre una vez
reclamados. Esta integración sigue estas ofertas en Gladys: los juegos gratis del momento y cuándo
terminan, los próximos y cuándo empiezan, un widget con las carátulas y un disparador de escena para
saberlo en cuanto haya un juego nuevo disponible.

Es **de solo lectura**: no reclama los juegos por usted, le dice cuándo ir a buscarlos.

> Integración no oficial, sin relación con Epic Games. Epic Games Store es una marca de Epic Games,
> Inc.

> **Desarrollada sin acceso a la API real**: se ha construido con respuestas grabadas de la tienda
> (las de las pruebas de la integración de Home Assistant). Sus comentarios son bienvenidos.

## Requisitos

- Gladys Assistant **5.1.0** o posterior (widgets y disparadores de escena).
- Acceso a Internet desde Gladys. Ninguna cuenta de Epic, ninguna clave de API.

## Configuración

1. Instale la integración desde el catálogo (o **Integraciones → Instalar desde GitHub**).
2. En la pestaña **Configuración**:
   - **Idioma**: el idioma de los textos del dispositivo, de las variables de escena y de los títulos
     y enlaces de la tienda (francés por defecto);
   - **País**: el código de dos letras de su región de la tienda (`FR` por defecto, `ES`, `MX`,
     `AR`…). Los juegos gratis pueden variar según el país.
3. Guarde, abra la pestaña **Descubrir** y añada el dispositivo **Epic Games Store**.

El botón **Actualizar ahora** lee la tienda enseguida y muestra, bajo el botón, los juegos gratis del
momento y los siguientes: práctico para comprobar el país elegido.

## El dispositivo

Un solo dispositivo, **Epic Games Store**, de solo lectura:

| Función                      | Contenido                                                 |
| ---------------------------- | --------------------------------------------------------- |
| Juegos gratis                | Los títulos de los juegos gratis ahora, separados por «·» |
| Gratis hasta                 | El fin de la oferta (el más próximo si hay varios)        |
| Juegos gratis ahora          | Su número                                                 |
| Próximos juegos gratis       | Los títulos de los próximos juegos anunciados             |
| Próximos juegos gratis desde | El inicio de la próxima oferta                            |
| Juegos gratis próximos       | Su número                                                 |

Las fechas se escriben en la zona horaria de Gladys, por ejemplo «jue, 22 oct, 17:00». Sin juego, los
títulos indican «Ninguno» y las fechas «—».

Durante los eventos especiales (Navidad, Mega Sale), Epic anuncia **juegos misteriosos**: aparecen
como «Juego misterioso» hasta que Epic los revela.

Gladys fija los nombres de las funciones al añadir el dispositivo, en el idioma elegido en ese
momento. Cambiar de idioma después traduce los valores, no los nombres.

## El widget

Añada al panel el widget **Juegos gratis de Epic**:

- una línea de resumen («2 gratis ahora · 2 próximos»);
- los juegos gratis y después los próximos, con su carátula, una insignia **Gratis** o **Pronto** y
  la fecha (el fin para un juego gratis, el inicio para uno próximo);
- al tocar un juego: la fecha, el editor, el precio habitual, la descripción y el enlace a la tienda;
- un botón **Todos los juegos gratis** hacia la página de la tienda.

Ajuste **Visualización**: cuadrícula de carátulas (por defecto) o lista. El widget se escribe en el
idioma del usuario que lo mira; la integración descarga y reduce las carátulas, su navegador nunca
contacta con Epic.

## El disparador de escena

**Nuevo juego gratis disponible** se dispara **una vez por juego**, cuando pasa a ser gratis (el
jueves hacia las 17:00, hora de París, y cada día durante el evento de Navidad). Pone a disposición de
la escena:

| Variable                    | Ejemplo                                             |
| --------------------------- | --------------------------------------------------- |
| Título del juego            | Filament                                            |
| Gratis hasta (fecha y hora) | jue, 10 nov, 17:00                                  |
| Gratis hasta (ISO 8601)     | 2022-11-10T16:00:00.000Z                            |
| Enlace a la tienda          | https://store.epicgames.com/es-ES/p/filament-332a92 |
| Editor                      | Kasedo Games Ltd                                    |
| Precio habitual             | 16,99 €                                             |

Conviene saber:

- en la primera lectura, los juegos que ya son gratis **no** se anuncian (instalar la integración un
  sábado no anuncia el juego regalado desde el jueves);
- un juego misterioso se anuncia una vez revelado, con su título real;
- los juegos ya anunciados se guardan en `/data`: un reinicio o una actualización nunca los anuncia
  una segunda vez;
- cambiar de país empieza de cero: los juegos que ya son gratis en el nuevo país no se anuncian.

La integración no tiene acción de escena: los valores del dispositivo bastan para una condición.

## Ejemplos de escenas

- **Notificación**: disparador «Nuevo juego gratis disponible» y después la acción «Enviar un
  mensaje»: «🎮 Título del juego es gratis hasta Gratis hasta (fecha y hora): Enlace a la tienda»,
  insertando cada variable desde el selector del editor.
- **Recordatorio antes del fin**: cada miércoles a las 19:00, si **Juegos gratis ahora** es mayor que
  0, enviar «¡Último día para reclamar los juegos gratis de Epic!».
- **Aviso por voz**: disparador «Nuevo juego gratis disponible», condición «entre las 9:00 y las
  22:00», y después hacer que el altavoz diga el título del juego.

## Solución de problemas

- **«La Epic Games Store no responde»** en la pestaña Configuración: Gladys no consigue contactar con
  la tienda (Internet, DNS, cortafuegos). La integración lo intenta de nuevo tras 5, 15, 30 y luego
  60 minutos y conserva mientras tanto los últimos juegos conocidos.
- **«La Epic Games Store no conoce este país»**: la tienda no conoce el código de país. Utilice un
  código ISO de dos letras (`ES`, `MX`, `AR`, `FR`…).
- **Los valores no aparecen**: el dispositivo debe haberse añadido desde la pestaña Descubrir; los
  valores se envían en cuanto se añade.
- **El disparador no se ha lanzado**: solo se lanza para un juego que _pasa a ser_ gratis mientras la
  integración funciona (véase más arriba).
- **Más detalles**: añada la variable de entorno `LOG_LEVEL=debug` y consulte los registros de la
  integración. Normalmente, solo escribe al arrancar, con cada juego nuevo y cuando hay un problema.

## Limitaciones

- La integración lee la dirección pública que usa la propia página «Juegos gratis» de la tienda
  (`store-site-backend-static.ak.epicgames.com/freeGamesPromotions`). Epic no la documenta y puede
  cambiarla sin previo aviso.
- La lee de 6 a 8 veces al día: cada 6 horas y luego 2 y 30 minutos después de cada cambio de oferta.
  Epic no publica ninguna cuota para esta dirección servida por una CDN; este ritmo sigue siendo el de
  un visitante.
- Solo se siguen los juegos **gratis**, no las rebajas.
- La tienda no indica si ya ha reclamado un juego: para ello hace falta una cuenta de Epic, y la
  integración no usa ninguna.
- Los juegos regalados en la aplicación móvil de la Epic Games Store no están incluidos.
