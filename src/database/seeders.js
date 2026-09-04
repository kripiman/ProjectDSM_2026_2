const { SPECIMEN_CATEGORIES, SPECIMEN_RARITIES } = require('../config/constants');
const { Specimen, Achievement, Quiz, QuizQuestion } = require('../models');

const seedData = async () => {
  const specimensCount = await Specimen.count();
  if (specimensCount === 0) {
    console.log('[Seeders] Seeding initial specimen catalog...');
    await Specimen.bulkCreate([
      // Minerals
      {
        id: 'quartz',
        name_es: 'Cuarzo',
        name_en: 'Quartz',
        scientific_name: 'Silicon Dioxide',
        category: SPECIMEN_CATEGORIES.MINERAL,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 7.0,
        mohs_hardness_max: 7.0,
        streak_color: 'Blanco',
        luster: 'Vítreo',
        color_description: 'Incoloro, blanco, morado (amatista), ahumado o rosado',
        crystal_system: 'Trigonal / Hexagonal',
        cleavage: 'Ninguno',
        fracture: 'Concoidea',
        magnetism: false,
        specific_gravity: 2.65,
        chemical_formula: 'SiO2',
        description: 'Uno de los minerales más abundantes en la corteza continental terrestre. Presente en una amplia variedad de rocas ígneas, sedimentarias y metamórficas.',
        identification_tips: 'Raya el vidrio con facilidad (dureza 7). Presenta fractura concoidea vítrea y carece de exfoliación evidente.',
        thumbnail_url: '/uploads/specimens/quartz_thumb.jpg',
        full_image_url: '/uploads/specimens/quartz_full.jpg',
        is_active: true
      },
      {
        id: 'pyrite',
        name_es: 'Pirita',
        name_en: 'Pyrite',
        scientific_name: 'Iron Disulfide',
        category: SPECIMEN_CATEGORIES.MINERAL,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 6.0,
        mohs_hardness_max: 6.5,
        streak_color: 'Verdoso oscuro a negro',
        luster: 'Metálico brillante',
        color_description: 'Amarillo latón a dorado pálido',
        crystal_system: 'Cúbico (isométrico)',
        cleavage: 'Indistinto',
        fracture: 'Concoidea a irregular',
        magnetism: false,
        specific_gravity: 5.01,
        chemical_formula: 'FeS2',
        description: 'Conocido popularmente como el "oro de los tontos" por su brillo dorado metálico. Se forma en ambientes hidrotermales y sedimentarios.',
        identification_tips: 'Su raya es de color negro verdoso (a diferencia del oro que deja raya dorada). Muy dura para ser un mineral metálico.',
        thumbnail_url: '/uploads/specimens/pyrite_thumb.jpg',
        full_image_url: '/uploads/specimens/pyrite_full.jpg',
        is_active: true
      },
      {
        id: 'calcite',
        name_es: 'Calcita',
        name_en: 'Calcite',
        scientific_name: 'Calcium Carbonate',
        category: SPECIMEN_CATEGORIES.MINERAL,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 3.0,
        mohs_hardness_max: 3.0,
        streak_color: 'Blanco',
        luster: 'Vítreo a resinoso',
        color_description: 'Generalmente blanco o incoloro, pero puede teñirse de amarillo, naranja o azul',
        crystal_system: 'Trigonal',
        cleavage: 'Romboédrica perfecta en 3 direcciones',
        fracture: 'Concoidea irregular',
        magnetism: false,
        specific_gravity: 2.71,
        chemical_formula: 'CaCO3',
        description: 'Mineral formador de rocas principal en calizas y mármoles. Famoso por su birrefringencia óptica.',
        identification_tips: 'Efervesce violentamente al contacto con ácido clorhídrico diluido (o vinagre fuerte). Puede rayarse con una moneda de cobre.',
        thumbnail_url: '/uploads/specimens/calcite_thumb.jpg',
        full_image_url: '/uploads/specimens/calcite_full.jpg',
        is_active: true
      },
      {
        id: 'magnetite',
        name_es: 'Magnetita',
        name_en: 'Magnetite',
        scientific_name: 'Iron(II,III) Oxide',
        category: SPECIMEN_CATEGORIES.MINERAL,
        rarity: SPECIMEN_RARITIES.UNCOMMON,
        mohs_hardness_min: 5.5,
        mohs_hardness_max: 6.5,
        streak_color: 'Negro',
        luster: 'Metálico a submetálico',
        color_description: 'Negro grisáceo a negro hierro',
        crystal_system: 'Cúbico (isométrico)',
        cleavage: 'Ninguno (partición octaédrica)',
        fracture: 'Subconcoidea a desigual',
        magnetism: true,
        specific_gravity: 5.18,
        chemical_formula: 'Fe3O4',
        description: 'Mineral de óxido de hierro ferrimagnético de gran importancia económica como mena de hierro.',
        identification_tips: 'Altamente magnético: atrae imanes potentes y agujas de brújula con facilidad.',
        thumbnail_url: '/uploads/specimens/magnetite_thumb.jpg',
        full_image_url: '/uploads/specimens/magnetite_full.jpg',
        is_active: true
      },
      {
        id: 'feldspar',
        name_es: 'Feldespato (Ortoclasa)',
        name_en: 'Potassium Feldspar',
        scientific_name: 'Potassium Aluminium Silicate',
        category: SPECIMEN_CATEGORIES.MINERAL,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 6.0,
        mohs_hardness_max: 6.0,
        streak_color: 'Blanco',
        luster: 'Vítreo a perlado',
        color_description: 'Rosa salmón, blanco, crema o gris',
        crystal_system: 'Monoclínico',
        cleavage: 'Perfecta a 90 grados en dos planos',
        fracture: 'Desigual',
        magnetism: false,
        specific_gravity: 2.56,
        chemical_formula: 'KAlSi3O8',
        description: 'Grupo de minerales más abundante de la corteza terrestre, componente esencial de granitos y pegmatitas.',
        identification_tips: 'Dureza 6 en la escala de Mohs. Típico color rosáceo o blanquecino con planos de exfoliación reflectantes en ángulo recto.',
        thumbnail_url: '/uploads/specimens/feldspar_thumb.jpg',
        full_image_url: '/uploads/specimens/feldspar_full.jpg',
        is_active: true
      },

      // Igneous Rocks
      {
        id: 'basalt',
        name_es: 'Basalto',
        name_en: 'Basalt',
        scientific_name: 'Extrusive Mafic Volcanic Rock',
        category: SPECIMEN_CATEGORIES.IGNEOUS_ROCK,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 5.0,
        mohs_hardness_max: 6.0,
        streak_color: 'Gris oscuro',
        luster: 'Mate / Terroso',
        color_description: 'Gris oscuro a negro',
        crystal_system: 'Afanítica (grano fino)',
        cleavage: 'No aplicable (roca)',
        fracture: 'Irregular',
        magnetism: false,
        specific_gravity: 2.9,
        chemical_formula: 'SiO2 (45-52%) + Fe, Mg, Ca',
        description: 'Roca volcánica ígnea extrusiva densa y oscura, dominante en los fondos oceánicos de la Tierra y en la Luna.',
        identification_tips: 'Roca pesada, de tonalidad oscura y matriz de grano muy fino, a menudo con pequeñas vesículas de gas.',
        thumbnail_url: '/uploads/specimens/basalt_thumb.jpg',
        full_image_url: '/uploads/specimens/basalt_full.jpg',
        is_active: true
      },
      {
        id: 'granite',
        name_es: 'Granito',
        name_en: 'Granite',
        scientific_name: 'Intrusive Felsic Plutonic Rock',
        category: SPECIMEN_CATEGORIES.IGNEOUS_ROCK,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 6.0,
        mohs_hardness_max: 7.0,
        streak_color: 'Blanco / Gris',
        luster: 'Vítreo y opaco granular',
        color_description: 'Moteado gris, rosa, blanco y negro',
        crystal_system: 'Fanerítica (grano grueso visible)',
        cleavage: 'No aplicable (roca)',
        fracture: 'Irregular',
        magnetism: false,
        specific_gravity: 2.7,
        chemical_formula: 'Cuarzo + Feldespato + Mica',
        description: 'Roca ígnea plutónica formada por el enfriamiento lento del magma a gran profundidad. Base de los escudos continentales.',
        identification_tips: 'Textura granular equigranular visible a simple vista con granos de cuarzo transparente, feldespato rosa/blanco y biotita negra.',
        thumbnail_url: '/uploads/specimens/granite_thumb.jpg',
        full_image_url: '/uploads/specimens/granite_full.jpg',
        is_active: true
      },
      {
        id: 'obsidian',
        name_es: 'Obsidiana',
        name_en: 'Obsidian',
        scientific_name: 'Natural Volcanic Glass',
        category: SPECIMEN_CATEGORIES.IGNEOUS_ROCK,
        rarity: SPECIMEN_RARITIES.UNCOMMON,
        mohs_hardness_min: 5.0,
        mohs_hardness_max: 5.5,
        streak_color: 'Blanco',
        luster: 'Vítreo brillante',
        color_description: 'Negro azabache, a veces con reflejos dorados o caoba',
        crystal_system: 'Amorfo (vidrio)',
        cleavage: 'Ninguna',
        fracture: 'Concoidea aguda muy pronunciada',
        magnetism: false,
        specific_gravity: 2.4,
        chemical_formula: 'SiO2 rica en felsita (>70%)',
        description: 'Vidrio volcánico natural formado por el enfriamiento instantáneo de lava viscosa rica en sílice.',
        identification_tips: 'Textura vidriosa impecable con bordes afilados cortantes y fracturas en anillos concéntricos.',
        thumbnail_url: '/uploads/specimens/obsidian_thumb.jpg',
        full_image_url: '/uploads/specimens/obsidian_full.jpg',
        is_active: true
      },

      // Sedimentary Rocks
      {
        id: 'limestone',
        name_es: 'Caliza',
        name_en: 'Limestone',
        scientific_name: 'Sedimentary Carbonate Rock',
        category: SPECIMEN_CATEGORIES.SEDIMENTARY_ROCK,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 3.0,
        mohs_hardness_max: 4.0,
        streak_color: 'Blanco',
        luster: 'Mate / Terroso',
        color_description: 'Blanco, crema, gris claro o parduzco',
        crystal_system: 'Clástica o química',
        cleavage: 'No aplicable (roca)',
        fracture: 'Irregular a concoidea suave',
        magnetism: false,
        specific_gravity: 2.6,
        chemical_formula: 'CaCO3 dominante',
        description: 'Roca sedimentaria compuesta principalmente por calcita marina, conchas fósiles y precipitados químicos.',
        identification_tips: 'Reacción espumosa evidente al aplicarle unas gotas de vinagre o ácido. A menudo contiene microfósiles visibles.',
        thumbnail_url: '/uploads/specimens/limestone_thumb.jpg',
        full_image_url: '/uploads/specimens/limestone_full.jpg',
        is_active: true
      },
      {
        id: 'sandstone',
        name_es: 'Arenisca',
        name_en: 'Sandstone',
        scientific_name: 'Clastic Sedimentary Rock',
        category: SPECIMEN_CATEGORIES.SEDIMENTARY_ROCK,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 6.0,
        mohs_hardness_max: 7.0,
        streak_color: 'Blanco / Ocre',
        luster: 'Arenoso / Mate',
        color_description: 'Rojizo, beige, marrón o amarillo',
        crystal_system: 'Clástica de grano medio',
        cleavage: 'No aplicable (roca)',
        fracture: 'Granular rugosa',
        magnetism: false,
        specific_gravity: 2.3,
        chemical_formula: 'Granos de SiO2 cementados',
        description: 'Roca sedimentaria clástica compuesta de fragmentos minerales del tamaño de la arena cementados con sílice, óxidos de hierro o carbonato.',
        identification_tips: 'Tacto áspero de papel de lija. Frecuente laminación y estratificación cruzada visible.',
        thumbnail_url: '/uploads/specimens/sandstone_thumb.jpg',
        full_image_url: '/uploads/specimens/sandstone_full.jpg',
        is_active: true
      },

      // Metamorphic Rocks
      {
        id: 'marble',
        name_es: 'Mármol',
        name_en: 'Marble',
        scientific_name: 'Metamorphosed Carbonate Rock',
        category: SPECIMEN_CATEGORIES.METAMORPHIC_ROCK,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 3.0,
        mohs_hardness_max: 4.0,
        streak_color: 'Blanco',
        luster: 'Sacaroideo / Perlado suave',
        color_description: 'Blanco con vetas grises, verdes o rosadas',
        crystal_system: 'Granoblástica (cristales entrelazados)',
        cleavage: 'No aplicable (roca)',
        fracture: 'Desigual',
        magnetism: false,
        specific_gravity: 2.7,
        chemical_formula: 'CaCO3 recristalizado',
        description: 'Roca metamórfica no foliada originada por el metamorfismo térmico y regional de rocas calizas.',
        identification_tips: 'Textura azucarada de cristales de calcita entrelazados. Fácil de rayar con un clavo de acero.',
        thumbnail_url: '/uploads/specimens/marble_thumb.jpg',
        full_image_url: '/uploads/specimens/marble_full.jpg',
        is_active: true
      },
      {
        id: 'slate',
        name_es: 'Pizarra',
        name_en: 'Slate',
        scientific_name: 'Foliated Metamorphic Rock',
        category: SPECIMEN_CATEGORIES.METAMORPHIC_ROCK,
        rarity: SPECIMEN_RARITIES.COMMON,
        mohs_hardness_min: 3.5,
        mohs_hardness_max: 4.5,
        streak_color: 'Gris claro',
        luster: 'Satinado a mate',
        color_description: 'Gris pizarra oscuro, negro, verdoso o morado',
        crystal_system: 'Foliada de grano muy fino',
        cleavage: 'Foliación pizarrosa plana perfecta',
        fracture: 'Laminar',
        magnetism: false,
        specific_gravity: 2.8,
        chemical_formula: 'Cuarzo + Moscovita/Illita',
        description: 'Roca metamórfica homogénea de grano fino que se divide fácilmente en hojas planas y delgadas debido a su exfoliación pizarrosa.',
        identification_tips: 'Se separa en lajas delgadas y planas con facilidad. Emite un sonido seco y metálico al golpearse suavemente.',
        thumbnail_url: '/uploads/specimens/slate_thumb.jpg',
        full_image_url: '/uploads/specimens/slate_full.jpg',
        is_active: true
      }
    ]);
    console.log('[Seeders] Specimens seeded successfully.');
  }

  const achievementsCount = await Achievement.count();
  if (achievementsCount === 0) {
    console.log('[Seeders] Seeding initial achievements...');
    await Achievement.bulkCreate([
      {
        id: 'first_scan',
        code: 'FIRST_SCAN',
        title: 'Primer Descubrimiento',
        description: 'Escanea y analiza tu primera roca o mineral.',
        category: 'discovery',
        icon_url: '/assets/achievements/first_scan.png',
        required_count: 1,
        xp_reward: 50,
        is_active: true
      },
      {
        id: 'novice_collector',
        code: 'NOVICE_COLLECTOR',
        title: 'Coleccionista Novato',
        description: 'Guarda 3 especímenes en tu colección personal.',
        category: 'discovery',
        icon_url: '/assets/achievements/novice_collector.png',
        required_count: 3,
        xp_reward: 100,
        is_active: true
      },
      {
        id: 'mineral_expert',
        code: 'MINERAL_EXPERT',
        title: 'Experto en Minerales',
        description: 'Descubre al menos 5 minerales diferentes.',
        category: 'discovery',
        icon_url: '/assets/achievements/mineral_expert.png',
        required_count: 5,
        xp_reward: 200,
        is_active: true
      },
      {
        id: 'refinement_master',
        code: 'REFINEMENT_MASTER',
        title: 'Ojo Clínico',
        description: 'Completa preguntas de refinamiento físico para ajustar una identificación.',
        category: 'refinement',
        icon_url: '/assets/achievements/refinement_master.png',
        required_count: 1,
        xp_reward: 75,
        is_active: true
      },
      {
        id: 'quiz_champion',
        code: 'QUIZ_CHAMPION',
        title: 'Cerebro Geológico',
        description: 'Aprueba tu primer quiz educativo sobre rocas y minerales.',
        category: 'quiz',
        icon_url: '/assets/achievements/quiz_champion.png',
        required_count: 1,
        xp_reward: 150,
        is_active: true
      }
    ]);
    console.log('[Seeders] Achievements seeded successfully.');
  }

  const quizCount = await Quiz.count();
  if (quizCount === 0) {
    console.log('[Seeders] Seeding initial quiz...');
    const basicQuiz = await Quiz.create({
      id: 'geology_basics_101',
      title: 'Fundamentos de Mineralogía',
      description: 'Pon a prueba tus conocimientos sobre dureza, brillo y propiedades físicas de minerales.',
      category: 'minerals',
      difficulty: 'easy',
      xp_reward: 100,
      is_active: true
    });

    await QuizQuestion.bulkCreate([
      {
        id: 'q1_mohs_scale',
        quiz_id: basicQuiz.id,
        specimen_id: 'quartz',
        question_text: '¿Cuál es la dureza del Cuarzo en la escala de Mohs?',
        explanation: 'El cuarzo es el mineral estándar para la dureza 7 en la escala de Mohs.',
        options: ['Dureza 3', 'Dureza 5', 'Dureza 7', 'Dureza 10'],
        correct_option_index: 2
      },
      {
        id: 'q2_fools_gold',
        quiz_id: basicQuiz.id,
        specimen_id: 'pyrite',
        question_text: '¿Por qué la Pirita es comúnmente llamada "el oro de los tontos"?',
        explanation: 'Por su color amarillo latón y brillo metálico semejante al oro nativo, aunque su raya es negruzca y es mucho más dura.',
        options: ['Por ser magnética', 'Por su brillo dorado metálico similar al oro', 'Por disolverse en agua', 'Por ser transparente'],
        correct_option_index: 1
      },
      {
        id: 'q3_magnetism',
        quiz_id: basicQuiz.id,
        specimen_id: 'magnetite',
        question_text: '¿Qué propiedad física distingue de inmediato a la Magnetita?',
        explanation: 'La magnetita es fuertemente ferrimagnética y atrae imanes.',
        options: ['Magnetismo natural', 'Color fluorescente', 'Efervescencia con agua', 'Sabor salado'],
        correct_option_index: 0
      }
    ]);
    console.log('[Seeders] Quizzes seeded successfully.');
  }
};

module.exports = {
  seedData
};
