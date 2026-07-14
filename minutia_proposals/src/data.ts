import { Session } from './types';

export const INITIAL_SESSIONS: Session[] = [
  {
    id: 'revision-estrategia-ia',
    title: 'Revisión de Estrategia IA',
    date: '11 Jul 2026',
    context: 'Reunión de comité de revisión de accidentes.',
    model: 'Avanzado v3.',
    language: 'Español.',
    transcripts: [
      {
        id: 't1',
        speaker: 'Hablante 1',
        time: '00:01',
        text: 'Hola a todos, gracias por venir a la sesión de hoy.'
      },
      {
        id: 't2',
        speaker: 'Hablante 2',
        time: '00:17',
        text: 'Buenos días. Listos para revisar los temas pendientes.'
      },
      {
        id: 't3',
        speaker: 'Hablante 1',
        time: '00:15',
        text: 'Carla no está conectar, me escrito en interno, me dice que tiene percarte. Uy, ya, ya ya un portavoz. Yo creo que si empezamos, ¿no? Ya perfecto. A ver, voluntario por formas. Perfecto. Doctor, buenos días.'
      },
      {
        id: 't4',
        speaker: 'Hablante 2',
        time: '00:32',
        text: 'Entendido. Empecemos de inmediato.'
      },
      {
        id: 't5',
        speaker: 'Hablante 1',
        time: '00:25',
        text: 'Ya, hola doctor, buenos días.'
      }
    ],
    summary: 'La reunión moderada por Gino Nanetti tuvo como objetivo empresa, centrándose en los casos de Sr. Calle (Callecita), Sr. Iparraguirre, Yeraldine, Sr. Tapujima, y otros. El comité evaluó estados médicos, brechas de documentación y riesgos legales, resultando en seguimientos programados y mitigación de litigios.',
    participants: [
      'Gino Nanetti (Moderador, Doctor)',
      'Martin (Participante, seguridad/operaciones)',
      'Anthony (Participante)',
      'Tarriony (Participante)',
      'Others....'
    ],
    topics: [
      {
        title: 'Caso Sacoti (Sr. Callecita)',
        content: 'sesiones de fisioterapia, amioscanea los alimentacioner laborase a, y centrándolas procesos, evaluaccimente, ni caso centrimo con los enuramiento nonfiontaments, brechas mèdica. y mitigación de litigios.'
      },
      {
        title: 'Caso Centrico (Sr. IParraguirre)',
        content: 'evaluaciones médicas, nrenomazs pz erados actuatoross y riesgos legales, resultando eer seguimienton es programados y mitigación de litigios.'
      }
    ]
  },
  {
    id: 'automatizacion-datos',
    title: 'Automatización de Datos',
    date: '10 Jul 2026',
    context: 'Reunión técnica para el diseño de pipelines de datos automatizados con LLMs.',
    model: 'QWEN3.5',
    language: 'Español.',
    transcripts: [
      {
        id: 'ad1',
        speaker: 'Hablante 1',
        time: '00:05',
        text: 'Revisemos la ingesta automática desde los buckets de Cloud Storage.'
      },
      {
        id: 'ad2',
        speaker: 'Hablante 2',
        time: '00:45',
        text: 'La latencia promedio actual es de menos de dos segundos por transcripción.'
      },
      {
        id: 'ad3',
        speaker: 'Hablante 3',
        time: '01:20',
        text: 'Perfecto, podemos escalar esto al entorno de producción para el próximo sprint.'
      }
    ],
    summary: 'Se evaluaron los pipelines de automatización para transcripción e indexado semántico. El equipo determinó optimizar la latencia mediante procesamiento distribuido y validó las reglas de privacidad de datos locales.',
    participants: [
      'Ing. Sofía Pérez (Líder Datos)',
      'Martin (Infraestructura)',
      'Hablante 3 (QA)',
      'Others...'
    ],
    topics: [
      {
        title: 'Pipelines de Ingesta',
        content: 'Despliegue automatizado de disparadores basados en almacenamiento cloud para optimizar costos de ejecución en frío.'
      },
      {
        title: 'Validación de Privacidad',
        content: 'Configuración de encriptación end-to-end local utilizando el modelo privado QWEN3.5 en servidores on-premise.'
      }
    ]
  },
  {
    id: 'optimizacion-flujo',
    title: 'Optimización de Flujo',
    date: '09 Jul 2026',
    context: 'Análisis de cuellos de botella en la entrega de transcripciones a clientes.',
    model: 'Gemma 4:2B',
    language: 'Español.',
    transcripts: [
      {
        id: 'of1',
        speaker: 'Hablante 1',
        time: '00:10',
        text: 'Algunos usuarios reportan demoras al descargar los audios largos.'
      },
      {
        id: 'of2',
        speaker: 'Hablante 2',
        time: '01:05',
        text: 'Se propone fragmentar el procesamiento en bloques de un minuto de manera paralela.'
      }
    ],
    summary: 'La discusión se enfocó en reducir el tiempo de carga mediante fragmentación de audios y caching inteligente de transcripciones repetidas.',
    participants: [
      'Carlos Ruiz (Product Manager)',
      'Elena Gómez (Arquitecta de Software)'
    ],
    topics: [
      {
        title: 'Fragmentación de Audios',
        content: 'Implementación de chunking paralelo para agilizar el feedback inicial del transcriptor.'
      },
      {
        title: 'Estrategia de Caché',
        content: 'Almacenamiento local seguro de fragmentos recurrentes de audio y eliminación de redundancias.'
      }
    ]
  },
  {
    id: 'analisis-riesgos',
    title: 'Análisis de Riesgos',
    date: '08 Jul 2026',
    context: 'Sesión legal para revisión de cumplimiento regulatorio y políticas de privacidad.',
    model: 'Avanzado v3.',
    language: 'Español.',
    transcripts: [
      {
        id: 'ar1',
        speaker: 'Hablante 1',
        time: '00:02',
        text: '¿Cumplimos plenamente con la protección de datos sensibles de pacientes y clientes?'
      },
      {
        id: 'ar2',
        speaker: 'Hablante 2',
        time: '00:58',
        text: 'Sí, todas las grabaciones se eliminan permanentemente tras finalizar la transcripción.'
      }
    ],
    summary: 'Evaluación del marco legal. Se ratificó el uso del almacenamiento efímero y se actualizaron los acuerdos de nivel de servicio para cumplir con las regulaciones de auditoría.',
    participants: [
      'Dra. Patricia Ortiz (Legal)',
      'Gino Nanetti (Doctor)',
      'Martin (Operaciones)'
    ],
    topics: [
      {
        title: 'Privacidad de Grabaciones',
        content: 'Aseguramiento de que ningún archivo de audio sea almacenado permanentemente sin consentimiento explícito.'
      },
      {
        title: 'Actualización de Términos',
        content: 'Revisión del acuerdo de usuario de MinutIA para recalcar la naturaleza privada y descentralizada de la herramienta.'
      }
    ]
  }
];
