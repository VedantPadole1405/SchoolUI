"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { isFirebaseEnabled, auth, db } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";

export interface QuizQuestion {
  id: string;
  subject: string;
  level: number;
  questionText: string;
  options: string[];
  correctAnswer: string;
  conceptHint: string;
  formulaReminder: string;
  smallClue: string;
}

export interface CourseModule {
  id: string;
  name: string;
  description?: string;
}

// Subjects and their corresponding configurations
interface SubjectConfig {
  id: string;
  name: string;
  themeColor: string; // Tailwind class prefix for colors
  accentGlow: string; // RGB/HSL value for inline style shadow
  personas: {
    id: string;
    name: string;
    avatar: string;
    role: string;
    intro: string;
  }[];
  modules?: CourseModule[];
}

const SUBJECTS: SubjectConfig[] = [
  {
    id: "math",
    name: "Mathematics",
    themeColor: "violet",
    accentGlow: "rgba(139, 92, 246, 0.15)",
    personas: [
      {
        id: "hypatia",
        name: "Hypatia of Alexandria",
        avatar: "📐",
        role: "Visual Intuition Coach",
        intro: "Greetings! I am Hypatia. Let us dissect mathematical problems not with rote memorization, but through visual geometry and logical deduction. What equation shall we solve today?"
      },
      {
        id: "pascal",
        name: "Blaise Pascal",
        avatar: "🎲",
        role: "Logic & Probability Mentor",
        intro: "Hello! I am Pascal. The universe is built on order and chance. Let's explore statistics, game theory, or algebra. What puzzle are we solving?"
      }
    ],
    modules: [
      { id: "math-foundations", name: "Module 1: Algebra & Geometry Foundations", description: "Equations, graphing, and structural geometric proofs." },
      { id: "math-calculus", name: "Module 2: Calculus & Functional Analysis", description: "Limits, derivatives, integrals, and series." },
      { id: "math-probability", name: "Module 3: Probability & Game Theory", description: "Combinatorics, random variables, and strategic choice." }
    ]
  },
  {
    id: "science",
    name: "Science",
    themeColor: "cyan",
    accentGlow: "rgba(6, 182, 212, 0.15)",
    personas: [
      {
        id: "curie",
        name: "Marie Curie",
        avatar: "🧪",
        role: "Experimental Guide",
        intro: "Hello! Let's approach science like a laboratory adventure. We will understand thermodynamics, light, or forces by visualizing practical experiments. What is on your mind?"
      },
      {
        id: "newton",
        name: "Isaac Newton",
        avatar: "🍎",
        role: "Classical Mechanics Master",
        intro: "Welcome. I am Isaac. Let us investigate the laws that govern motion and gravity. Tell me what forces or orbits you wish to calculate."
      }
    ],
    modules: [
      { id: "sci-mechanics", name: "Module 1: Classical Mechanics & Forces", description: "Newtonian laws, kinematics, energy conservation, and orbits." },
      { id: "sci-thermo", name: "Module 2: Thermodynamics & Waves", description: "Heat engines, entropy, light propagation, and wave properties." },
      { id: "sci-chem-bio", name: "Module 3: Organic Chem & Cellular Biology", description: "Chemical bonding, molecular structure, DNA, and cell replication." }
    ]
  },
  {
    id: "history",
    name: "World History",
    themeColor: "amber",
    accentGlow: "rgba(245, 158, 11, 0.15)",
    personas: [
      {
        id: "socrates",
        name: "Socrates",
        avatar: "🏺",
        role: "Socratic Inquirer",
        intro: "I know only that I know nothing. Let us examine the actions of ancient civilizations, revolutions, and treaties together. What historical event shall we question?"
      },
      {
        id: "herodotus",
        name: "Herodotus",
        avatar: "📜",
        role: "Chronicle Narrator",
        intro: "Greetings, traveler! I am Herodotus, the father of histories. Let me weave the stories of empires, battles, and cultural exchanges. Which epoch shall we visit?"
      }
    ],
    modules: [
      { id: "hist-ancient", name: "Module 1: Ancient & Classical Empires", description: "Mesopotamia, Egypt, Greece, Rome, and Han China." },
      { id: "hist-medieval", name: "Module 2: Middle Ages & Renaissance", description: "Feudalism, trade routes, cultural exchanges, and humanism." },
      { id: "hist-modern", name: "Module 3: Modern Revolutions & World Wars", description: "Industrial revolution, nation-states, WWI, WWII, and the Cold War." }
    ]
  },
  {
    id: "english",
    name: "English / Lit",
    themeColor: "rose",
    accentGlow: "rgba(244, 63, 94, 0.15)",
    personas: [
      {
        id: "shakespeare",
        name: "William Shakespeare",
        avatar: "🖋️",
        role: "Dramatic & Theme Analyst",
        intro: "A warm welcome! Let us explore the depths of metaphor, sonnets, and character arcs. What great work or writing piece shall we polish today?"
      },
      {
        id: "orwell",
        name: "George Orwell",
        avatar: "👁️",
        role: "Critical Essay Guide",
        intro: "Hello. Let's focus on clear, honest writing. We will dissect political subtext, symbolisms, and refine your thesis statement. What text are we reading?"
      }
    ],
    modules: [
      { id: "eng-poetry", name: "Module 1: Poetry, Metaphor & Theme", description: "Literary devices, sonnets, structural forms, and figurative language." },
      { id: "eng-drama", name: "Module 2: Dramatic Analysis & Shakespeare", description: "Character arcs, tragic/comic structures, and playwriting." },
      { id: "eng-essay", name: "Module 3: Critical Composition & Rhetoric", description: "Thesis statements, argumentation, prose styles, and editing." }
    ]
  }
];

// Predefined suggestion triggers for students in normal chat
const SUGGESTIONS: Record<string, string[]> = {
  math: [
    "Explain the derivative chain rule.",
    "Help me solve x^2 - 5x + 6 = 0.",
    "What is Euler's constant?"
  ],
  science: [
    "How does gravity bend space-time?",
    "Explain entropy simply.",
    "How do solar panels turn light into electricity?"
  ],
  history: [
    "What caused the fall of the Roman Empire?",
    "Compare the French and American Revolutions.",
    "Who was Mansa Musa?"
  ],
  english: [
    "What does Gatsby's green light symbolize?",
    "How do I write a strong thesis statement?",
    "Explain the theme of alienation in Kafka's Metamorphosis."
  ]
};

// Flashcard definitions
interface Flashcard {
  id: number;
  subject: string;
  front: string;
  back: string;
}

const INITIAL_FLASHCARDS: Flashcard[] = [
  { id: 1, subject: "math", front: "Derivative", back: "The instantaneous rate of change of a function with respect to one of its variables (the slope of the tangent line)." },
  { id: 2, subject: "math", front: "Eigenvector", back: "A non-zero vector that changes at most by a scalar factor when a linear transformation is applied to it." },
  { id: 3, subject: "science", front: "Schrödinger's Cat", back: "A thought experiment showing the paradox of quantum superposition where a cat is simultaneously alive and dead until observed." },
  { id: 4, subject: "science", front: "First Law of Thermodynamics", back: "Energy cannot be created or destroyed, only transformed from one form to another (Conservation of Energy)." },
  { id: 5, subject: "history", front: "Magna Carta (1215)", back: "A charter signed by King John of England establishing the principle that everyone, including the king, is subject to the law." },
  { id: 6, subject: "history", front: "Silk Road", back: "An ancient network of trade routes connecting East and West, central to economic, cultural, and political interactions." },
  { id: 7, subject: "english", front: "Metaphor vs. Simile", back: "A metaphor directly states one thing is another ('heart of gold'), while a simile uses 'like' or 'as' ('brave as a lion')." },
  { id: 8, subject: "english", front: "Deus Ex Machina", back: "A plot device where a seemingly unsolvable problem is suddenly resolved by an unexpected and unlikely occurrence." }
];

export interface CourseMaterial {
  id: string;
  title: string;
  type: "pdf" | "image" | "notes";
  content: string;
  uploadedAt: string;
  fileSize: string;
  isActive: boolean;
  moduleId?: string;
  isChroma?: boolean;
}

const INITIAL_COURSE_MATERIALS: Record<string, CourseMaterial[]> = {
  math: [
    {
      id: "math-mat-1",
      title: "Calculus Limits Reference.pdf",
      type: "pdf",
      content: "A limit is the value that a function approaches as the input approaches some value. The derivative of a function represents its instantaneous rate of change. It is defined as the limit as h approaches 0 of [f(x+h) - f(x)] / h. The Power Rule states that d/dx[x^n] = n*x^(n-1). For example, the derivative of x³ is 3x².",
      uploadedAt: "2026-06-01",
      fileSize: "12 KB",
      isActive: true
    },
    {
      id: "math-mat-2",
      title: "Quadratic Factoring Sheet.png",
      type: "image",
      content: "Quadratic Equation Standard Form: ax² + bx + c = 0. To factor a quadratic equation x² + bx + c = 0, find two numbers that multiply to c and add to b. For example, to solve x² - 5x + 6 = 0, find two numbers that multiply to 6 and add to -5: they are -2 and -3. Therefore, factors are (x - 2)(x - 3) = 0, giving roots x = 2 and x = 3.",
      uploadedAt: "2026-06-03",
      fileSize: "850 KB",
      isActive: false
    }
  ],
  science: [
    {
      id: "sci-mat-1",
      title: "Photosynthesis Process Guide.pdf",
      type: "pdf",
      content: "Photosynthesis is the process by which plants use sunlight to synthesize foods from carbon dioxide and water. In plants, photosynthesis takes place in chloroplasts. Light-dependent reactions happen in the thylakoid membranes where light is absorbed by chlorophyll to make ATP and NADPH, releasing oxygen. Light-independent reactions (Calvin Cycle) take place in the stroma, using ATP and NADPH to fix carbon dioxide and produce glucose (C6H12O6).",
      uploadedAt: "2026-06-02",
      fileSize: "24 KB",
      isActive: true
    }
  ],
  history: [
    {
      id: "hist-mat-1",
      title: "Magna Carta Summary of 1215.pdf",
      type: "pdf",
      content: "The Magna Carta was signed by King John of England in 1215. It established the principle that everyone, including the king, is subject to the law, and guarantees the rights of individuals, the right to justice, and the right to a fair trial. It was meant to limit royal tyranny and protect nobility rights.",
      uploadedAt: "2026-05-28",
      fileSize: "15 KB",
      isActive: true
    }
  ],
  english: [
    {
      id: "eng-mat-1",
      title: "Gatsby Symbolism & Metaphors.pdf",
      type: "pdf",
      content: "In F. Scott Fitzgerald's 'The Great Gatsby', the green light at the end of Daisy's dock represents Gatsby's hopes and dreams for the future. It is a symbol of the elusive American Dream, always within sight but forever out of reach. Fitzgerald uses the metaphor of 'boats against the current' to show the struggle of humanity trying to move forward while being drawn back by the past.",
      uploadedAt: "2026-06-04",
      fileSize: "18 KB",
      isActive: true
    }
  ]
};

// Fallback Quiz Questions Database (if RAG or API generation is not connected)
const INITIAL_QUIZ_QUESTIONS: Record<string, Record<number, QuizQuestion>> = {
  math: {
    1: {
      id: "math-1",
      subject: "math",
      level: 1,
      questionText: "Solve for x: 3x - 7 = 11",
      options: ["x = 4", "x = 5", "x = 6", "x = 8"],
      correctAnswer: "x = 6",
      conceptHint: "We want to isolate x. This means moving all other terms to the opposite side of the equals sign using inverse operations.",
      formulaReminder: "If Ax - B = C, then Ax = C + B, and x = (C + B) / A.",
      smallClue: "Try adding 7 to both sides first. What does the equation look like after that?"
    },
    2: {
      id: "math-2",
      subject: "math",
      level: 2,
      questionText: "What are the roots of the quadratic equation: x² - 5x + 6 = 0?",
      options: ["x = 1 and x = 6", "x = 2 and x = 3", "x = -2 and x = -3", "x = 1 and x = 5"],
      correctAnswer: "x = 2 and x = 3",
      conceptHint: "We are factoring a trinomial. We need two numbers that multiply to the constant (+6) and add to the middle coefficient (-5).",
      formulaReminder: "Standard form: ax² + bx + c = 0. Factors as (x - p)(x - q) = 0 where p + q = -b and p * q = c.",
      smallClue: "Which pair of numbers multiplies to positive 6 and adds to negative 5? Test 2 and 3."
    },
    3: {
      id: "math-3",
      subject: "math",
      level: 3,
      questionText: "Using the Chain Rule, what is the first derivative of f(x) = (3x² + 2)³?",
      options: [
        "f'(x) = 3(3x² + 2)²",
        "f'(x) = 6x(3x² + 2)²",
        "f'(x) = 18x(3x² + 2)¹",
        "f'(x) = 18x(3x² + 2)²"
      ],
      correctAnswer: "f'(x) = 18x(3x² + 2)²",
      conceptHint: "The chain rule states we take the derivative of the 'outer' function and multiply it by the derivative of the 'inner' function.",
      formulaReminder: "d/dx[ u(x)^n ] = n * u(x)^(n-1) * u'(x). Here, u(x) = 3x² + 2.",
      smallClue: "The derivative of the inside, 3x² + 2, is 6x. The derivative of the outside is 3(3x² + 2)². Multiply them together!"
    }
  },
  science: {
    1: {
      id: "science-1",
      subject: "science",
      level: 1,
      questionText: "A car travels a distance of 150 meters in exactly 10 seconds. What is its average speed?",
      options: ["10 m/s", "15 m/s", "20 m/s", "150 m/s"],
      correctAnswer: "15 m/s",
      conceptHint: "Average speed is defined as the total distance covered divided by the time it took to cover that distance.",
      formulaReminder: "Speed (v) = Distance (d) / Time (t).",
      smallClue: "Divide the total distance of 150m by the total time of 10s."
    },
    2: {
      id: "science-2",
      subject: "science",
      level: 2,
      questionText: "If a 2 kg bowling ball is rolling down a lane at a velocity of 4 m/s, what is its kinetic energy?",
      options: ["8 Joules", "16 Joules", "32 Joules", "64 Joules"],
      correctAnswer: "16 Joules",
      conceptHint: "Kinetic energy is the energy an object possesses due to its motion, depending on both mass and speed.",
      formulaReminder: "KE = ½ * m * v², where m is mass in kg, and v is velocity in m/s.",
      smallClue: "Square the velocity first (4² = 16), then multiply by the mass (2 kg), then divide by 2."
    },
    3: {
      id: "science-3",
      subject: "science",
      level: 3,
      questionText: "According to Einstein's Theory of Special Relativity, what happens to time as an object's velocity approaches the speed of light?",
      options: [
        "Time speeds up for the object relative to a stationary observer.",
        "Time slows down (dilates) for the object relative to a stationary observer.",
        "Time flows identically in all reference frames.",
        "Time ceases to flow entirely."
      ],
      correctAnswer: "Time slows down (dilates) for the object relative to a stationary observer.",
      conceptHint: "This is time dilation. Time is relative, and clocks in a moving reference frame tick slower when viewed by a stationary frame.",
      formulaReminder: "t' = t / sqrt(1 - v²/c²). As velocity v increases, the time interval stretches.",
      smallClue: "As speed approaches light-speed c, the denominator approaches 0, meaning the dilated time interval t' approaches infinity (time dilates/slows down)."
    }
  },
  history: {
    1: {
      id: "history-1",
      subject: "history",
      level: 1,
      questionText: "What was the primary significance of the Magna Carta, signed by King John in 1215?",
      options: [
        "It officially dissolved the feudal system in England.",
        "It established the principle that even the monarch is subject to the law.",
        "It declared war on the Kingdom of France.",
        "It created the first democratic Parliament in Europe."
      ],
      correctAnswer: "It established the principle that even the monarch is subject to the law.",
      conceptHint: "The Magna Carta was signed by King John under pressure from rebel barons to limit royal tyranny.",
      formulaReminder: "Historical Context: Limiting monarchical supremacy and protecting nobility rights from arbitrary taxation.",
      smallClue: "Focus on how it limited absolute power. It set the historical precedent that the law is supreme, even over kings."
    },
    2: {
      id: "history-2",
      subject: "history",
      level: 2,
      questionText: "Which social class made up the Third Estate in pre-revolutionary France, bearing the tax burden while possessing little power?",
      options: [
        "The Clergy (church officials)",
        "The Nobility (aristocracy)",
        "The Commoners (peasants, merchants, and professionals)",
        "The Royal Monarchy"
      ],
      correctAnswer: "The Commoners (peasants, merchants, and professionals)",
      conceptHint: "France's Old Regime divided society into three Estates. The first two held privileges and paid virtually no taxes.",
      formulaReminder: "Social Hierarchy: 1st Estate = Clergy; 2nd Estate = Nobility; 3rd Estate = Peasants, Bourgeoisie, and Artisans (98% of people).",
      smallClue: "It was the largest class, containing everybody else besides the church and the aristocracy."
    },
    3: {
      id: "history-3",
      subject: "history",
      level: 3,
      questionText: "What specific trigger event activated the alliance systems in Europe and directly initiated World War I in 1914?",
      options: [
        "The sinking of the passenger liner RMS Lusitania",
        "The German invasion of Poland",
        "The assassination of Archduke Franz Ferdinand of Austria-Hungary",
        "The signing of the Treaty of Versailles"
      ],
      correctAnswer: "The assassination of Archduke Franz Ferdinand of Austria-Hungary",
      conceptHint: "An assassination in Sarajevo in June 1914 sparked conflict between Austro-Hungary and Serbia, pulling in Russia, Germany, and others.",
      formulaReminder: "Alliance Web: Serbia -> Russia -> France; Austro-Hungary -> Germany.",
      smallClue: "It was the assassination of the heir to the Austro-Hungarian throne by a Serbian nationalist in Sarajevo."
    }
  },
  english: {
    1: {
      id: "english-1",
      subject: "english",
      level: 1,
      questionText: "Identify the figure of speech used in the sentence: 'The classroom was a zoo.'",
      options: ["Simile", "Metaphor", "Personification", "Hyperbole"],
      correctAnswer: "Metaphor",
      conceptHint: "We are comparing two unlike things directly to suggest a resemblance.",
      formulaReminder: "A simile compares using 'like' or 'as'. A metaphor compares by stating one thing IS another.",
      smallClue: "The sentence says the classroom *was* a zoo, rather than *like* a zoo."
    },
    2: {
      id: "english-2",
      subject: "english",
      level: 2,
      questionText: "Which of the following represents the strongest arguable thesis statement for a literary analysis essay?",
      options: [
        "The Great Gatsby is a novel written by F. Scott Fitzgerald featuring Gatsby.",
        "Gatsby is a rich man who throws large parties to impress a daisy.",
        "Fitzgerald uses the green light to show that the American Dream is an illusion that remains forever out of reach.",
        "In the novel, Gatsby represents hope and love."
      ],
      correctAnswer: "Fitzgerald uses the green light to show that the American Dream is an illusion that remains forever out of reach.",
      conceptHint: "A strong thesis must be arguable. It should state a clear claim that requires textual evidence to prove, rather than a simple fact.",
      formulaReminder: "Thesis = Topic + Stance + Arguable Rationale ('How' or 'Why').",
      smallClue: "Look for the statement that argues *why* or *how* a specific literary device (the green light) is used to convey a deeper theme."
    },
    3: {
      id: "english-3",
      subject: "english",
      level: 3,
      questionText: "What literary term describes the repetition of initial consonant sounds in close succession?",
      options: ["Assonance", "Consonance", "Alliteration", "Onomatopoeia"],
      correctAnswer: "Alliteration",
      conceptHint: "This device is often used in poetry and tongue twisters, creating rhythm by repeating starting sounds.",
      formulaReminder: "Alliteration = initial consonants. Assonance = internal vowels. Consonance = final/middle consonants.",
      smallClue: "Think of sentences where every word starts with the same letter, like 'Peter Piper picked...'"
    }
  }
};

export interface StudentGradeRecord {
  id: string;
  name: string;
  avatar: string;
  email: string;
  enrolledCourse: string;
  adaptiveLevel: number;
  cognitiveEffort: number;
  gmatScore: number;
  classScore?: number;
  lastActive: string;
  totalQuestions: number;
  correctAnswers: number;
  hintsUsedCount: number;
  recentActivity: {
    questionText: string;
    level: number;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    hintsRequested: number;
    timestamp: string;
  }[];
}

const INITIAL_STUDENTS_ROSTER: StudentGradeRecord[] = [
  {
    id: "alex",
    name: "Alex Mercer (You)",
    avatar: "🎒",
    email: "alex@school.edu",
    enrolledCourse: "Mathematics",
    adaptiveLevel: 2,
    cognitiveEffort: 90,
    gmatScore: 580,
    lastActive: "Just now",
    totalQuestions: 8,
    correctAnswers: 5,
    hintsUsedCount: 3,
    recentActivity: [
      {
        questionText: "What is the derivative of the function f(x) = 5x^3 + 2x^2 - 7 at the point x = 1?",
        level: 2,
        userAnswer: "19",
        correctAnswer: "19",
        isCorrect: true,
        hintsRequested: 1,
        timestamp: "02:15 PM"
      },
      {
        questionText: "Find the limit of (x^2 - 4)/(x - 2) as x approaches 2.",
        level: 1,
        userAnswer: "4",
        correctAnswer: "4",
        isCorrect: true,
        hintsRequested: 0,
        timestamp: "01:58 PM"
      },
      {
        questionText: "Solve the equation: x^2 - 5x + 6 = 0.",
        level: 1,
        userAnswer: "x = 4",
        correctAnswer: "x = 2 and x = 3",
        isCorrect: false,
        hintsRequested: 2,
        timestamp: "01:30 PM"
      }
    ]
  },
  {
    id: "jane",
    name: "Jane Doe",
    avatar: "👩‍🔬",
    email: "jane.doe@school.edu",
    enrolledCourse: "Natural Sciences",
    adaptiveLevel: 2,
    cognitiveEffort: 75,
    gmatScore: 610,
    lastActive: "15 mins ago",
    totalQuestions: 12,
    correctAnswers: 8,
    hintsUsedCount: 7,
    recentActivity: [
      {
        questionText: "What are the primary products of the light-dependent reactions in photosynthesis?",
        level: 2,
        userAnswer: "ATP and NADPH",
        correctAnswer: "ATP and NADPH",
        isCorrect: true,
        hintsRequested: 2,
        timestamp: "02:10 PM"
      },
      {
        questionText: "Which organelle is primarily responsible for generating ATP in cellular respiration?",
        level: 1,
        userAnswer: "Mitochondria",
        correctAnswer: "Mitochondria",
        isCorrect: true,
        hintsRequested: 0,
        timestamp: "01:45 PM"
      }
    ]
  },
  {
    id: "john",
    name: "John Smith",
    avatar: "🏺",
    email: "smith.j@school.edu",
    enrolledCourse: "World History",
    adaptiveLevel: 1,
    cognitiveEffort: 48,
    gmatScore: 460,
    lastActive: "2 hours ago",
    totalQuestions: 6,
    correctAnswers: 2,
    hintsUsedCount: 9,
    recentActivity: [
      {
        questionText: "In what year was the Magna Carta signed?",
        level: 1,
        userAnswer: "1215",
        correctAnswer: "1215",
        isCorrect: true,
        hintsRequested: 3,
        timestamp: "12:12 PM"
      },
      {
        questionText: "Who was the first official Emperor of the Roman Empire?",
        level: 1,
        userAnswer: "Julius Caesar",
        correctAnswer: "Augustus Caesar",
        isCorrect: false,
        hintsRequested: 4,
        timestamp: "11:50 AM"
      }
    ]
  },
  {
    id: "emma",
    name: "Emma Watson",
    avatar: "🎓",
    email: "emma.w@school.edu",
    enrolledCourse: "English / Lit",
    adaptiveLevel: 3,
    cognitiveEffort: 98,
    gmatScore: 780,
    lastActive: "1 day ago",
    totalQuestions: 15,
    correctAnswers: 14,
    hintsUsedCount: 1,
    recentActivity: [
      {
        questionText: "In The Great Gatsby, what does the green light at the end of the dock primarily symbolize?",
        level: 3,
        userAnswer: "Fitzgerald uses the green light to show that the American Dream is an illusion that remains forever out of reach.",
        correctAnswer: "Fitzgerald uses the green light to show that the American Dream is an illusion that remains forever out of reach.",
        isCorrect: true,
        hintsRequested: 0,
        timestamp: "Yesterday"
      }
    ]
  },
  {
    id: "david",
    name: "David Miller",
    avatar: "🎨",
    email: "d.miller@school.edu",
    enrolledCourse: "Mathematics",
    adaptiveLevel: 2,
    cognitiveEffort: 65,
    gmatScore: 540,
    lastActive: "3 days ago",
    totalQuestions: 9,
    correctAnswers: 5,
    hintsUsedCount: 5,
    recentActivity: []
  }
];

export default function Dashboard() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<"student" | "teacher" | null>(null);
  const [studentsRoster, setStudentsRoster] = useState<StudentGradeRecord[]>(INITIAL_STUDENTS_ROSTER);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<StudentGradeRecord | null>(null);
  const [assignedQuizTask, setAssignedQuizTask] = useState<{ subject: string; level: number; focus: string; maxQuestions?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "quiz" | "courses" | "progress" | "teacher" | "gradebook">("courses");
  const [courseMaterials, setCourseMaterials] = useState<Record<string, CourseMaterial[]>>(INITIAL_COURSE_MATERIALS);
  const [selectedCourseForBoard, setSelectedCourseForBoard] = useState<SubjectConfig | null>(null);
  const [selectedMaterialForPreview, setSelectedMaterialForPreview] = useState<CourseMaterial | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploadingMock, setIsUploadingMock] = useState<boolean>(false);
  const [selectedRawFile, setSelectedRawFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("Alex Mercer");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("alex@school.edu");
  const [subjectsList, setSubjectsList] = useState<SubjectConfig[]>(SUBJECTS);
  const [teacherSelectedCourseId, setTeacherSelectedCourseId] = useState<string | null>(null);
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState<boolean>(false);
  const [inviteCourse, setInviteCourse] = useState<SubjectConfig | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseIcon, setNewCourseIcon] = useState("📚");
  const [newCourseColor, setNewCourseColor] = useState("violet");
  const [newTutorName, setNewTutorName] = useState("");
  const [newTutorAvatar, setNewTutorAvatar] = useState("🤖");
  const [newTutorRole, setNewTutorRole] = useState("Adaptive Tutor");
  const [newTutorIntro, setNewTutorIntro] = useState("");

  const [uploadModuleId, setUploadModuleId] = useState<string>("");
  const [newModuleName, setNewModuleName] = useState<string>("");
  const [newModuleDesc, setNewModuleDesc] = useState<string>("");
  const [selectedModuleForPractice, setSelectedModuleForPractice] = useState<string | null>(null);
  const [activeHintText, setActiveHintText] = useState<string | null>(null);
  const [rosterSubjectFilter, setRosterSubjectFilter] = useState<string>("all");

  const [selectedSubject, setSelectedSubject] = useState<SubjectConfig>(SUBJECTS[0]);
  const [selectedPersona, setSelectedPersona] = useState(SUBJECTS[0].personas[0]);
  const [inputVal, setInputVal] = useState("");
  const [messages, setMessages] = useState<Record<string, { sender: "student" | "tutor"; text: string }[]>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [xp, setXp] = useState(380);
  const [streak, setStreak] = useState(5);

  // Adaptive Academic Mastery Score (0-100) instead of GMAT score
  const [classScore, setClassScore] = useState<number>(75);
  const [gmatScore, setGmatScore] = useState<number>(580); // Keep synced for compatibility

  // Course Instructor states
  const [instructorId, setInstructorId] = useState<string>("");
  const [instructorName, setInstructorName] = useState<string>("");
  const [availableTeachers, setAvailableTeachers] = useState<{ uid: string; name: string; email: string }[]>([]);

  // Gradual difficulty adjustment counters
  const [consecutiveCorrect, setConsecutiveCorrect] = useState<number>(0);
  const [consecutiveIncorrect, setConsecutiveIncorrect] = useState<number>(0);

  // Quiz Session limit states
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(1);
  const [quizLengthLimit, setQuizLengthLimit] = useState<number>(10);
  const [quizCompleted, setQuizCompleted] = useState<boolean>(false);
  const [quizSessionPoints, setQuizSessionPoints] = useState<number>(0);
  const [quizSessionMaxPoints, setQuizSessionMaxPoints] = useState<number>(0);
  const [quizSessionCorrect, setQuizSessionCorrect] = useState<number>(0);
  const [quizSessionHints, setQuizSessionHints] = useState<number>(0);

  // Ingested Teacher Notes by Subject
  const [teacherSyllabusNotes, setTeacherSyllabusNotes] = useState<Record<string, string>>({});

  // Quiz Active Question & Loading States
  const [activeQuestion, setActiveQuestion] = useState<QuizQuestion>(INITIAL_QUIZ_QUESTIONS["math"][1]);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState<boolean>(false);
  const [quizDifficulty, setQuizDifficulty] = useState<number>(1);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<string>("");
  const [quizChatMessages, setQuizChatMessages] = useState<Record<string, { sender: "student" | "tutor"; text: string }[]>>({});
  
  // Hint Penalty Score States
  const [scorePotential, setScorePotential] = useState<number>(100);
  const [usedHints, setUsedHints] = useState<string[]>([]);
  const [historyList, setHistoryList] = useState<string[]>([]);

  // Teacher Hub Display States
  const [teacherNotes, setTeacherNotes] = useState<string>("");
  const [ingestionStatus, setIngestionStatus] = useState<string>("");
  const [currentSourceMaterial, setCurrentSourceMaterial] = useState<string>("Standard Curriculum Syllabus");
  const [extractedEntities, setExtractedEntities] = useState<string[]>(["Core syllabus definitions", "Adaptive GMAT/GRE scoring"]);
  const [uploadSubject, setUploadSubject] = useState<string>("math");
  const [uploadTitle, setUploadTitle] = useState<string>("");
  const [uploadType, setUploadType] = useState<"pdf" | "image" | "notes">("pdf");
  const [uploadContent, setUploadContent] = useState<string>("");

  // Achievements State
  const [badges, setBadges] = useState([
    { name: "Deep Thinker", icon: "🧠", desc: "Asked 10 detailed questions", unlocked: true },
    { name: "Formula Wizard", icon: "🧙‍♂️", desc: "Solved 5 algebra equations", unlocked: true },
    { name: "Time Traveler", icon: "⏳", desc: "Ingested dynamic RAG course notes", unlocked: false },
    { name: "Socratic Disciple", icon: "🏺", desc: "Engaged in a 10-turn dialogue", unlocked: false }
  ]);

  // Flashcards state
  const [flashcards, setFlashcards] = useState<Flashcard[]>(INITIAL_FLASHCARDS);
  const [flippedCardId, setFlippedCardId] = useState<number | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const quizChatEndRef = useRef<HTMLDivElement>(null);

  // Scroll functions
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const scrollQuizToBottom = () => {
    quizChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Hydrate custom courses and materials based on user role and UID
  useEffect(() => {
    if (!userRole) return;
    const currentUid = isFirebaseEnabled && auth?.currentUser ? auth.currentUser.uid : (localStorage.getItem("mock_current_user_uid") || "mock-student-alex");
    
    if (userRole === "teacher") {
      const savedSubjects = localStorage.getItem(`aether_subjects_${currentUid}`);
      if (savedSubjects) {
        try {
          const parsed = JSON.parse(savedSubjects);
          setSubjectsList(parsed);
          if (parsed.length > 0) {
            setSelectedSubject(parsed[0]);
            if (parsed[0].personas && parsed[0].personas.length > 0) {
              setSelectedPersona(parsed[0].personas[0]);
            }
          } else {
            setSelectedSubject({ id: "", name: "", themeColor: "violet", accentGlow: "", personas: [] });
          }
        } catch (e) {
          console.error("Failed to parse saved subjects", e);
        }
      } else {
        if (currentUid === "mock-teacher-emily") {
          setSubjectsList(SUBJECTS);
          setSelectedSubject(SUBJECTS[0]);
          setSelectedPersona(SUBJECTS[0].personas[0]);
          localStorage.setItem(`aether_subjects_${currentUid}`, JSON.stringify(SUBJECTS));
        } else {
          setSubjectsList([]);
          setSelectedSubject({ id: "", name: "", themeColor: "violet", accentGlow: "", personas: [] });
          localStorage.setItem(`aether_subjects_${currentUid}`, JSON.stringify([]));
        }
      }

      const savedMaterials = localStorage.getItem(`aether_materials_${currentUid}`);
      if (savedMaterials) {
        try {
          setCourseMaterials(JSON.parse(savedMaterials));
        } catch (e) {
          console.error("Failed to parse saved materials", e);
        }
      } else {
        if (currentUid === "mock-teacher-emily") {
          setCourseMaterials(INITIAL_COURSE_MATERIALS);
          localStorage.setItem(`aether_materials_${currentUid}`, JSON.stringify(INITIAL_COURSE_MATERIALS));
        } else {
          setCourseMaterials({});
          localStorage.setItem(`aether_materials_${currentUid}`, JSON.stringify({}));
        }
      }
    } else {
      // Student mode
      if (currentUid === "mock-student-alex") {
        const emilySubjectsJSON = localStorage.getItem("aether_subjects_mock-teacher-emily");
        const emilySubjects = emilySubjectsJSON ? JSON.parse(emilySubjectsJSON) : SUBJECTS;
        setSubjectsList(emilySubjects);
        if (emilySubjects.length > 0) {
          setSelectedSubject(emilySubjects[0]);
          if (emilySubjects[0].personas && emilySubjects[0].personas.length > 0) {
            setSelectedPersona(emilySubjects[0].personas[0]);
          }
        }
        
        const emilyMaterialsJSON = localStorage.getItem("aether_materials_mock-teacher-emily");
        const emilyMaterials = emilyMaterialsJSON ? JSON.parse(emilyMaterialsJSON) : INITIAL_COURSE_MATERIALS;
        setCourseMaterials(emilyMaterials);
      } else {
        // Custom student
        const mockUsersJSON = localStorage.getItem("aether_mock_users");
        const mockUsers = mockUsersJSON ? JSON.parse(mockUsersJSON) : [];
        const studentUser = mockUsers.find((u: any) => u.uid === currentUid);
        
        if (studentUser && studentUser.instructorId) {
          const teacherSubjects = localStorage.getItem(`aether_subjects_${studentUser.instructorId}`);
          const teacherMaterials = localStorage.getItem(`aether_materials_${studentUser.instructorId}`);
          
          const parsedSubjects = teacherSubjects ? JSON.parse(teacherSubjects) : [];
          const parsedMaterials = teacherMaterials ? JSON.parse(teacherMaterials) : {};
          
          const enrolledCourse = parsedSubjects.filter((s: any) => s.id === studentUser.enrolledCourseId);
          setSubjectsList(enrolledCourse);
          
          const filteredMaterials: Record<string, CourseMaterial[]> = {};
          if (studentUser.enrolledCourseId && parsedMaterials[studentUser.enrolledCourseId]) {
            filteredMaterials[studentUser.enrolledCourseId] = parsedMaterials[studentUser.enrolledCourseId];
          }
          setCourseMaterials(filteredMaterials);
          
          if (enrolledCourse.length > 0) {
            setSelectedSubject(enrolledCourse[0]);
            if (enrolledCourse[0].personas && enrolledCourse[0].personas.length > 0) {
              setSelectedPersona(enrolledCourse[0].personas[0]);
            }
          }
        } else {
          setSubjectsList([]);
          setCourseMaterials({});
          setSelectedSubject({ id: "", name: "", themeColor: "violet", accentGlow: "", personas: [] });
        }
      }
    }
  }, [userRole]);

  // Sync teacher subjects and materials to unique localStorage slots, user objects, and Firestore
  useEffect(() => {
    if (userRole !== "teacher") return;
    const currentUid = isFirebaseEnabled && auth?.currentUser ? auth.currentUser.uid : (localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily");
    if (!currentUid) return;

    localStorage.setItem(`aether_subjects_${currentUid}`, JSON.stringify(subjectsList));
    localStorage.setItem(`aether_materials_${currentUid}`, JSON.stringify(courseMaterials));

    if (!isFirebaseEnabled) {
      const mockUsersJSON = localStorage.getItem("aether_mock_users");
      if (mockUsersJSON) {
        let mockUsers = JSON.parse(mockUsersJSON);
        mockUsers = mockUsers.map((u: any) => {
          if (u.uid === currentUid) {
            return {
              ...u,
              subjects: subjectsList,
              courseMaterials: courseMaterials
            };
          }
          return u;
        });
        localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
      }
    } else if (db) {
      updateDoc(doc(db, "users", currentUid), {
        subjects: subjectsList,
        courseMaterials: courseMaterials
      }).catch(err => console.error("Error syncing courses to Firestore:", err));
    }
  }, [subjectsList, courseMaterials, userRole]);

  const handleCreateCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseName.trim() || !newTutorName.trim()) {
      alert("Please enter a course name and tutor name.");
      return;
    }

    const newCourseId = newCourseName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    // Ensure uniqueness
    if (subjectsList.some(s => s.id === newCourseId)) {
      alert("A course with a similar name already exists.");
      return;
    }

    const newCourse: SubjectConfig = {
      id: newCourseId,
      name: newCourseName,
      themeColor: newCourseColor,
      accentGlow: newCourseColor === "violet" ? "rgba(139, 92, 246, 0.15)" :
                  newCourseColor === "cyan" ? "rgba(6, 182, 212, 0.15)" :
                  newCourseColor === "amber" ? "rgba(245, 158, 11, 0.15)" :
                  newCourseColor === "rose" ? "rgba(244, 63, 94, 0.15)" :
                  newCourseColor === "emerald" ? "rgba(16, 185, 129, 0.15)" : "rgba(59, 130, 246, 0.15)",
      personas: [
        {
          id: `${newCourseId}-tutor`,
          name: newTutorName,
          avatar: newTutorAvatar,
          role: newTutorRole,
          intro: newTutorIntro || `Greetings! I am ${newTutorName}, your personal Socratic tutor for ${newCourseName}. Let us explore the concepts together. What would you like to discuss?`
        }
      ]
    };

    const updatedSubjects = [...subjectsList, newCourse];
    setSubjectsList(updatedSubjects);

    // Initialize course materials slot
    setCourseMaterials(prev => ({
      ...prev,
      [newCourseId]: []
    }));

    // Reset fields
    setNewCourseName("");
    setNewCourseIcon("📚");
    setNewCourseColor("violet");
    setNewTutorName("");
    setNewTutorAvatar("🤖");
    setNewTutorRole("Adaptive Tutor");
    setNewTutorIntro("");
    setIsCreateCourseModalOpen(false);
  };

  const handleDeleteCourse = (courseId: string) => {
    const isDefault = ["math", "science", "history", "english"].includes(courseId);
    if (isDefault) {
      alert("Default core courses cannot be deleted.");
      return;
    }
    if (confirm("Are you sure you want to delete this course? All its uploaded documents will be permanently lost.")) {
      setSubjectsList(prev => prev.filter(s => s.id !== courseId));
      // Clean up course materials
      setCourseMaterials(prev => {
        const copy = { ...prev };
        delete copy[courseId];
        return copy;
      });
      if (teacherSelectedCourseId === courseId) {
        setTeacherSelectedCourseId(null);
      }
      // Reset active subject if it was deleted
      if (selectedSubject.id === courseId) {
        const remaining = subjectsList.filter(s => s.id !== courseId);
        if (remaining.length > 0) {
          setSelectedSubject(remaining[0]);
          setSelectedPersona(remaining[0].personas[0]);
        }
      }
    }
  };

  // Load profile details from Firebase or localStorage mock on mount
  useEffect(() => {
    if (!isFirebaseEnabled || !auth || !db) {
      // Mock mode initialization
      const savedRole = localStorage.getItem("user_role") as "student" | "teacher";
      const currentUid = localStorage.getItem("mock_current_user_uid");
      const mockUsersJSON = localStorage.getItem("aether_mock_users");
      const mockUsers = mockUsersJSON ? JSON.parse(mockUsersJSON) : [];
      
      const foundUser = mockUsers.find((u: any) => u.uid === currentUid);
      if (foundUser) {
        setUserRole(foundUser.role);
        setCurrentUserName(foundUser.name);
        setCurrentUserEmail(foundUser.email);
        localStorage.setItem("user_role", foundUser.role);
        if (foundUser.role === "student") {
          setActiveTab("courses");
          if (foundUser.classScore !== undefined) setClassScore(foundUser.classScore);
          if (foundUser.gmatScore !== undefined) setGmatScore(foundUser.gmatScore);
          if (foundUser.xp !== undefined) setXp(foundUser.xp);
          if (foundUser.streak !== undefined) setStreak(foundUser.streak);
          if (foundUser.instructorId !== undefined) setInstructorId(foundUser.instructorId);
          if (foundUser.instructorName !== undefined) setInstructorName(foundUser.instructorName);
        } else {
          setActiveTab("gradebook");
          if (foundUser.activeAssignment) {
            setAssignedQuizTask(foundUser.activeAssignment);
          }
        }
      } else {
        setUserRole(savedRole || "student");
        setActiveTab(savedRole === "teacher" ? "gradebook" : "courses");
        setCurrentUserName(savedRole === "teacher" ? "Prof. Emily Vance" : "Alex Mercer");
        setCurrentUserEmail(savedRole === "teacher" ? "emily@school.edu" : "alex@school.edu");
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.role) {
              setUserRole(data.role);
              localStorage.setItem("user_role", data.role);
            }
            if (data.name) {
              setCurrentUserName(data.name);
            }
            if (data.email) {
              setCurrentUserEmail(data.email);
            }
            if (data.xp !== undefined) setXp(data.xp);
            if (data.streak !== undefined) setStreak(data.streak);
            if (data.gmatScore !== undefined) setGmatScore(data.gmatScore);
            if (data.classScore !== undefined) {
              setClassScore(data.classScore);
            } else if (data.gmatScore !== undefined) {
              setClassScore(Math.round(((data.gmatScore - 200) / 600) * 100));
            }
            if (data.instructorId !== undefined) setInstructorId(data.instructorId);
            if (data.instructorName !== undefined) setInstructorName(data.instructorName);
          }
        } catch (error) {
          console.error("Error fetching user profile from Firestore:", error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleRoleSwitch = (newRole: "student" | "teacher") => {
    setUserRole(newRole);
    localStorage.setItem("user_role", newRole);
    if (newRole === "teacher") {
      setActiveTab("gradebook");
      setCurrentUserName("Prof. Emily Vance");
      setCurrentUserEmail("emily@school.edu");
      const mockUsersJSON = localStorage.getItem("aether_mock_users");
      const mockUsers = mockUsersJSON ? JSON.parse(mockUsersJSON) : [];
      const emily = mockUsers.find((u: any) => u.role === "teacher");
      if (emily) {
        localStorage.setItem("mock_current_user_uid", emily.uid);
      } else {
        localStorage.setItem("mock_current_user_uid", "mock-teacher-emily");
      }
    } else {
      setActiveTab("courses");
      setCurrentUserName("Alex Mercer");
      setCurrentUserEmail("alex@school.edu");
      const mockUsersJSON = localStorage.getItem("aether_mock_users");
      const mockUsers = mockUsersJSON ? JSON.parse(mockUsersJSON) : [];
      const alex = mockUsers.find((u: any) => u.role === "student");
      if (alex) {
        localStorage.setItem("mock_current_user_uid", alex.uid);
        if (alex.classScore !== undefined) setClassScore(alex.classScore);
        if (alex.gmatScore !== undefined) setGmatScore(alex.gmatScore);
        if (alex.xp !== undefined) setXp(alex.xp);
        if (alex.streak !== undefined) setStreak(alex.streak);
        if (alex.instructorId !== undefined) setInstructorId(alex.instructorId);
        if (alex.instructorName !== undefined) setInstructorName(alex.instructorName);
      } else {
        localStorage.setItem("mock_current_user_uid", "mock-student-alex");
      }
    }
  };

  // Sync Student Stats to Firestore
  useEffect(() => {
    if (!isFirebaseEnabled || !auth || !db || !auth.currentUser || userRole !== "student") return;
    const user = auth.currentUser;
    const updateStats = async () => {
      try {
        await updateDoc(doc(db, "users", user.uid), {
          xp,
          streak,
          gmatScore,
          classScore,
          instructorId,
          instructorName
        });
      } catch (e) {
        console.error("Failed to update student stats in Firestore:", e);
      }
    };
    updateStats();
  }, [xp, streak, gmatScore, classScore, instructorId, instructorName, userRole]);

  // Sync Student Stats to LocalStorage Mock
  useEffect(() => {
    if (isFirebaseEnabled || userRole !== "student") return;
    const currentUid = localStorage.getItem("mock_current_user_uid");
    if (!currentUid) return;
    const mockUsersJSON = localStorage.getItem("aether_mock_users");
    if (!mockUsersJSON) return;
    let mockUsers = JSON.parse(mockUsersJSON);
    mockUsers = mockUsers.map((u: any) => {
      if (u.uid === currentUid) {
        return {
          ...u,
          xp,
          streak,
          classScore,
          gmatScore,
          instructorId,
          instructorName
        };
      }
      return u;
    });
    localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
  }, [xp, streak, classScore, gmatScore, instructorId, instructorName, userRole]);

  // Fetch student rosters (enrolled and unenrolled)
  const [unenrolledStudents, setUnenrolledStudents] = useState<StudentGradeRecord[]>([]);

  const fetchRoster = async () => {
    const teacherUid = isFirebaseEnabled && auth?.currentUser ? auth.currentUser.uid : (localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily");
    
    if (isFirebaseEnabled && db) {
      try {
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const querySnapshot = await getDocs(q);
        const enrolled: StudentGradeRecord[] = [];
        const unenrolled: StudentGradeRecord[] = [];
        
        querySnapshot.forEach((docSnap) => {
          const u = docSnap.data();
          const record: StudentGradeRecord = {
            id: u.uid || docSnap.id,
            name: u.name || "Anonymous Student",
            avatar: "🎒",
            email: u.email || "",
            enrolledCourse: u.enrolledCourse || "Mathematics",
            adaptiveLevel: u.adaptiveLevel || 1,
            cognitiveEffort: u.cognitiveEffort || 75,
            gmatScore: u.classScore !== undefined ? u.classScore : (u.gmatScore !== undefined ? Math.round(((u.gmatScore - 200) / 600) * 100) : 75), // Map for displays
            lastActive: u.createdAt ? u.createdAt.split("T")[0] : new Date().toISOString().split("T")[0],
            totalQuestions: u.totalQuestions || 0,
            correctAnswers: u.correctAnswers || 0,
            hintsUsedCount: u.hintsUsedCount || 0,
            recentActivity: u.recentActivity || []
          };
          
          if (u.instructorId === teacherUid) {
            enrolled.push(record);
          } else {
            unenrolled.push(record);
          }
        });

        setStudentsRoster(enrolled);
        setUnenrolledStudents(unenrolled);
      } catch (error) {
        console.error("Error fetching dynamic student roster from Firestore:", error);
      }
    } else {
      // Mock mode
      const mockUsersJSON = localStorage.getItem("aether_mock_users");
      const mockUsers = mockUsersJSON ? JSON.parse(mockUsersJSON) : [];
      const students = mockUsers.filter((u: any) => u.role === "student");
      
      const enrolled: StudentGradeRecord[] = [];
      const unenrolled: StudentGradeRecord[] = [];

      students.forEach((u: any) => {
        const record: StudentGradeRecord = {
          id: u.uid,
          name: u.name || "Anonymous Student",
          avatar: "🎒",
          email: u.email || "",
          enrolledCourse: u.enrolledCourse || (u.instructorId === teacherUid ? "Mathematics" : "Syllabus Elective"),
          adaptiveLevel: u.adaptiveLevel || 2,
          cognitiveEffort: u.cognitiveEffort || 85,
          gmatScore: u.classScore !== undefined ? u.classScore : (u.gmatScore !== undefined ? Math.round(((u.gmatScore - 200) / 600) * 100) : 75),
          lastActive: u.createdAt ? u.createdAt.split("T")[0] : "Just now",
          totalQuestions: u.totalQuestions || 0,
          correctAnswers: u.correctAnswers || 0,
          hintsUsedCount: u.hintsUsedCount || 0,
          recentActivity: u.recentActivity || []
        };

        if (u.instructorId === teacherUid) {
          enrolled.push(record);
        } else {
          unenrolled.push(record);
        }
      });

      // Fallback pre-populated lists if none registered in mock storage
      if (enrolled.length === 0 && unenrolled.length === 0) {
        if (teacherUid === "mock-teacher-emily") {
          setStudentsRoster(INITIAL_STUDENTS_ROSTER.filter(s => s.id === "alex"));
          setUnenrolledStudents(INITIAL_STUDENTS_ROSTER.filter(s => s.id !== "alex"));
        } else {
          setStudentsRoster([]);
          setUnenrolledStudents([]);
        }
      } else {
        setStudentsRoster(enrolled);
        setUnenrolledStudents(unenrolled);
      }
    }
  };

  const handleSelectInstructor = async (teacherUid: string, teacherName: string) => {
    setInstructorId(teacherUid);
    setInstructorName(teacherName);
    
    if (isFirebaseEnabled && auth?.currentUser && db) {
      try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          instructorId: teacherUid,
          instructorName: teacherName
        });
      } catch (e) {
        console.error("Error setting instructor in Firestore:", e);
      }
    } else {
      // Mock mode
      const currentUid = localStorage.getItem("mock_current_user_uid");
      if (currentUid) {
        const mockUsersJSON = localStorage.getItem("aether_mock_users");
        if (mockUsersJSON) {
          let mockUsers = JSON.parse(mockUsersJSON);
          mockUsers = mockUsers.map((u: any) => {
            if (u.uid === currentUid) {
              return { ...u, instructorId: teacherUid, instructorName: teacherName };
            }
            return u;
          });
          localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
        }
      }
    }
    alert(`Successfully chosen ${teacherName || "no instructor"} as your course instructor!`);
  };

  const handleEnrollStudent = async (studentUid: string) => {
    const teacherUid = isFirebaseEnabled && auth?.currentUser ? auth.currentUser.uid : (localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily");
    const teacherName = currentUserName;

    if (isFirebaseEnabled && db) {
      try {
        await updateDoc(doc(db, "users", studentUid), {
          instructorId: teacherUid,
          instructorName: teacherName
        });
        alert("Student successfully enrolled in your class!");
        fetchRoster();
      } catch (e) {
        console.error("Error enrolling student in Firestore:", e);
      }
    } else {
      // Mock mode
      const mockUsersJSON = localStorage.getItem("aether_mock_users");
      if (mockUsersJSON) {
        let mockUsers = JSON.parse(mockUsersJSON);
        mockUsers = mockUsers.map((u: any) => {
          if (u.uid === studentUid) {
            return { ...u, instructorId: teacherUid, instructorName: teacherName };
          }
          return u;
        });
        localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
        alert("Student successfully enrolled in your class!");
        fetchRoster();
      }
    }
  };

  useEffect(() => {
    if (userRole === "teacher") {
      fetchRoster();
    }
  }, [userRole]);

  useEffect(() => {
    if (activeTab === "chat") {
      scrollToBottom();
    } else if (activeTab === "quiz") {
      scrollQuizToBottom();
    }
  }, [messages, quizChatMessages, isTyping, activeTab]);

  // Fetch a single unique question dynamically from our API
  const fetchNewQuestion = async (subjectId: string, level: number, customNotes?: string, customModuleId?: string) => {
    setIsLoadingQuestion(true);
    resetQuizQuestionState();

    try {
      const activeModuleId = customModuleId || selectedModuleForPractice;
      const targetSubject = subjectsList.find(s => s.id === subjectId) || selectedSubject;
      const selectedModObj = targetSubject.modules?.find(m => m.id === activeModuleId);
      const modHeader = selectedModObj ? `Module Focus: ${selectedModObj.name}\n${selectedModObj.description || ""}\n\n` : "";

      let searchQuery = targetSubject.name;
      if (selectedModObj) {
        searchQuery = `${targetSubject.name} - ${selectedModObj.name}`;
      }

      const notes = modHeader + (customNotes || (courseMaterials[subjectId] || [])
        .filter((m) => m.isActive && (!activeModuleId || m.moduleId === activeModuleId))
        .map((m) => m.content)
        .join("\n\n") || teacherSyllabusNotes[subjectId] || "");
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          level,
          subject: subjectId,
          exclude: historyList,
          moduleId: activeModuleId || undefined,
          searchQuery
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          const generatedQ: QuizQuestion = {
            ...data.question,
            id: `api-gen-${Date.now()}`,
            subject: subjectId,
            level
          };
          setActiveQuestion(generatedQ);
          setHistoryList((prev) => [...prev, generatedQ.questionText]);

          // Set custom welcome message from tutor
          const newQuizKey = `quiz-${subjectId}-${generatedQ.id}`;
          setQuizChatMessages((prev) => ({
            ...prev,
            [newQuizKey]: [
              {
                sender: "tutor",
                text: `Welcome to this Level ${level} ${data.question.questionText ? "AI Generated" : ""} challenge! Let's study problem solving, not memorizing. Points Potential: 100 XP. What are you thinking?`
              }
            ]
          }));

          setIsLoadingQuestion(false);
          return;
        }
      }
    } catch (error) {
      console.warn("Failed fetching from dynamic AI quiz API. Loading standard local sandbox question.", error);
    }

    // Local Fallback:
    const fallbackQ = INITIAL_QUIZ_QUESTIONS[subjectId]?.[level] || {
      id: `fallback-${subjectId}-${level}-${Date.now()}`,
      subject: subjectId,
      level,
      questionText: `Identify the core objective of studying ${selectedSubject.name} at Level ${level}.`,
      options: [
        `Understand fundamental concepts of ${selectedSubject.name}`,
        `Apply core formulas and rules of ${selectedSubject.name}`,
        `Analyze advanced edge cases of ${selectedSubject.name}`,
        `Memorize standard facts of ${selectedSubject.name}`
      ],
      correctAnswer: `Understand fundamental concepts of ${selectedSubject.name}`,
      conceptHint: `This is a fallback question for ${selectedSubject.name}. Upload course documents in the Course Materials panel to generate custom questions via AI.`,
      formulaReminder: "Formula: Concept + Application = Mastery.",
      smallClue: "Look for the option about understanding fundamental concepts."
    };
    setActiveQuestion(fallbackQ);
    setHistoryList((prev) => [...prev, fallbackQ.questionText]);
    setIsLoadingQuestion(false);
  };

  // Trigger initial fetch when entering the Quiz tab
  useEffect(() => {
    if (activeTab === "quiz") {
      const isValidModule = selectedSubject.modules?.some(m => m.id === selectedModuleForPractice);
      const modId = isValidModule ? selectedModuleForPractice : (selectedSubject.modules?.[0]?.id || null);
      if (modId !== selectedModuleForPractice) {
        setSelectedModuleForPractice(modId);
      }
      fetchNewQuestion(selectedSubject.id, quizDifficulty, undefined, modId || undefined);
    }
  }, [activeTab, selectedSubject]);

  const resetQuizQuestionState = (level: number = quizDifficulty) => {
    setSelectedOption(null);
    setHasSubmitted(false);
    setIsCorrect(null);
    setQuizFeedback("");
    setScorePotential(level === 1 ? 60 : level === 2 ? 80 : 100);
    setUsedHints([]);
    setActiveHintText(null);
  };

  const getConvKey = () => `${selectedSubject.id}-${selectedPersona.id}`;
  
  // Normal Chat Conversation
  const activeMessages = messages[getConvKey()] || [
    { sender: "tutor", text: selectedPersona.intro }
  ];

  const getQuizKey = () => `quiz-${selectedSubject.id}-${activeQuestion.id}`;
  
  // Quiz chat conversation
  const activeQuizMessages = quizChatMessages[getQuizKey()] || [
    {
      sender: "tutor",
      text: `Let's tackle this ${selectedSubject.name} question! I am here to guide you, but asking for hints will deduct points from your score potential. What do you think is our first step?`
    }
  ];

  // Helper to generate simulated Socratic response for normal chat (Fallback)
  const generateNormalResponse = (query: string): string => {
    const q = query.toLowerCase();
    const sub = selectedSubject.id;

    if (sub === "math") {
      if (q.includes("derivative") || q.includes("chain")) {
        return `Ah, the Chain Rule! Imagine nesting boxes. If you want to see how fast the outer box size changes relative to the inner contents, you multiply the rate of change of the outer box by the rate of change of the inner box: d/dx[f(g(x))] = f'(g(x)) * g'(x). Shall we try applying this to (2x + 3)^5?`;
      }
      if (q.includes("solve") || q.includes("equation") || q.includes("x^2")) {
        return `Let's solve x² - 5x + 6 = 0. In this quadratic form, we need two numbers that multiply to the constant (6) and add up to the linear coefficient (-5). What two numbers come to your mind? (Hint: think about factors of 6).`;
      }
      return `${selectedPersona.name} here. Mathematics is about seeing patterns. If we represent your question as a set of variables, what is the known element, and what is the unknown we seek to discover?`;
    }

    if (sub === "science") {
      if (q.includes("gravity") || q.includes("bend")) {
        return `Curvature of space-time! Imagine a heavy bowling ball sitting on a soft trampoline. It creates a dip. If you roll a marble across, it rolls down into the dip. Einstein's theory of General Relativity says that matter tells space how to curve, and curved space tells matter how to move. What do you think happens if the mass gets infinitely heavy, like a black hole?`;
      }
      if (q.includes("entropy")) {
        return `Think of entropy as the dispersion of energy. If you drop a glass and it shatters, the energy disperses. Re-assembling the glass would require concentrated effort, raising entropy elsewhere. The universe naturally flows from concentrated order to dispersed disorder.`;
      }
      return `Let's construct a mental experiment. If we remove all friction and air resistance, how would this system behave? What forces are acting upon our object?`;
    }

    if (sub === "history") {
      if (q.includes("roman") || q.includes("rome")) {
        return `Socrates here. The collapse of Rome was not a single event, but a slow erosion. Between fiscal inflation, political corruption, military dependency on mercenary forces, and pressure from migrating tribes, the foundations buckled. If you were a Roman citizen in 400 AD, which of these issues do you think would alarm you the most?`;
      }
      if (q.includes("revolution")) {
        return `A fascinating comparison! The American Revolution sought to preserve existing colonial liberties from British oversight. The French Revolution, however, wanted to tear down the entire social order—monarchy, nobility, and church. Why do you think one resulted in a republic and the other in the Reign of Terror?`;
      }
      return `To understand this event, let us ask: who wrote our primary records, what were their biases, and what material circumstances (money, crops, climate) drove the people of this era to act?`;
    }

    if (sub === "english") {
      if (q.includes("gatsby") || q.includes("light")) {
        return `The green light! Perched at the end of Daisy's dock, it represents Gatsby's hopes and dreams for the future. But notice how it is *across* the water—unattainable, representing the elusive American Dream. As Nick Carraway writes, we 'beat on, boats against the current, borne back ceaselessly into the past.' Do you think Gatsby ever realized Daisy was different from his dream of her?`;
      }
      if (q.includes("thesis")) {
        return `A strong thesis statement must be arguable. Avoid stating facts. Instead of saying 'William Shakespeare wrote Hamlet,' say something like 'In Hamlet, Shakespeare uses the motif of delay to criticize the court politics of Elizabethan England.' This gives you a clear argument to prove. What is your essay topic?`;
      }
      return `Let us look at the prose itself. What words stand out to you? What is the author leaving unsaid in the spaces between sentences?`;
    }

    return `Interesting point. Let's dig deeper. How does this connect to our core concept of ${selectedSubject.name}? What is your immediate hypothesis?`;
  };

  // Socratic Response Generator for the Quiz Chat Window (Fallback)
  const generateQuizSocraticResponse = (query: string): string => {
    const q = query.toLowerCase();
    
    if (
      q.includes("answer") || 
      q.includes("correct option") || 
      q.includes("tell me which option") || 
      q.includes("is it a") || 
      q.includes("is it b") || 
      q.includes("is it c") || 
      q.includes("is it d") ||
      q.includes("give me the key")
    ) {
      return `I cannot tell you the correct option directly! That would defeat the purpose of developing your problem-solving skills. Let's work it out: ${activeQuestion.conceptHint} Which option best matches this description?`;
    }

    if (selectedSubject.id === "math") {
      if (q.includes("concept") || q.includes("hint")) {
        return activeQuestion.conceptHint;
      }
      if (q.includes("formula") || q.includes("rule")) {
        return activeQuestion.formulaReminder;
      }
      if (q.includes("clue")) {
        return activeQuestion.smallClue;
      }
    }

    if (selectedSubject.id === "science") {
      if (q.includes("concept") || q.includes("hint")) {
        return activeQuestion.conceptHint;
      }
      if (q.includes("formula") || q.includes("rule") || q.includes("equation")) {
        return activeQuestion.formulaReminder;
      }
      if (q.includes("clue")) {
        return activeQuestion.smallClue;
      }
    }

    if (selectedSubject.id === "history") {
      if (q.includes("concept") || q.includes("hint")) {
        return activeQuestion.conceptHint;
      }
      if (q.includes("context") || q.includes("notes")) {
        return activeQuestion.formulaReminder;
      }
      if (q.includes("clue")) {
        return activeQuestion.smallClue;
      }
    }

    if (selectedSubject.id === "english") {
      if (q.includes("concept") || q.includes("hint")) {
        return activeQuestion.conceptHint;
      }
      if (q.includes("rule") || q.includes("definition")) {
        return activeQuestion.formulaReminder;
      }
      if (q.includes("clue")) {
        return activeQuestion.smallClue;
      }
    }

    return `Let's break down this problem. What is your immediate hypothesis when reading the question? Let's rule out the obviously incorrect options first. Which ones do you think they are?`;
  };

  // Send a message in normal study chat
  const handleSendNormalMessage = async (textToSend?: string) => {
    const msgText = textToSend || inputVal;
    if (!msgText.trim()) return;

    const convKey = getConvKey();
    const currentMessages = messages[convKey] || [
      { sender: "tutor", text: selectedPersona.intro }
    ];

    const newStudentMsg = { sender: "student" as const, text: msgText };
    const updatedMessages = [...currentMessages, newStudentMsg];
    
    setMessages({
      ...messages,
      [convKey]: updatedMessages
    });

    if (!textToSend) setInputVal("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          subject: selectedSubject,
          persona: selectedPersona,
          mode: "general"
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          setMessages((prev) => ({
            ...prev,
            [convKey]: [...(prev[convKey] || updatedMessages), { sender: "tutor", text: data.text }]
          }));
          setIsTyping(false);
          setXp((prev) => prev + 15);
          return;
        }
      }
    } catch (e) {
      console.warn("API unavailable, falling back to local simulation.", e);
    }

    // Fallback to local sandbox engine:
    setTimeout(() => {
      const replyText = generateNormalResponse(msgText);
      const newTutorMsg = { sender: "tutor" as const, text: replyText };
      
      setMessages((prev) => ({
        ...prev,
        [convKey]: [...(prev[convKey] || updatedMessages), newTutorMsg]
      }));
      setIsTyping(false);
      setXp((prev) => prev + 15);
    }, 1200);
  };

  // Send a message in Quiz Help Chat (Right Side)
  const handleSendQuizMessage = async (textToSend?: string) => {
    const msgText = textToSend || inputVal;
    if (!msgText.trim()) return;

    const quizKey = getQuizKey();
    const currentMessages = quizChatMessages[quizKey] || [];

    const newStudentMsg = { sender: "student" as const, text: msgText };
    const updatedMessages = [...currentMessages, newStudentMsg];
    
    setQuizChatMessages({
      ...quizChatMessages,
      [quizKey]: updatedMessages
    });

    if (!textToSend) setInputVal("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          subject: selectedSubject,
          persona: selectedPersona,
          activeQuestion,
          mode: "quiz"
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          setQuizChatMessages((prev) => ({
            ...prev,
            [quizKey]: [...(prev[quizKey] || updatedMessages), { sender: "tutor", text: data.text }]
          }));
          setIsTyping(false);
          setXp((prev) => prev + 10);
          return;
        }
      }
    } catch (e) {
      console.warn("API unavailable, falling back to local simulation.", e);
    }

    // Fallback to local sandbox engine:
    setTimeout(() => {
      const replyText = generateQuizSocraticResponse(msgText);
      const newTutorMsg = { sender: "tutor" as const, text: replyText };
      
      setQuizChatMessages((prev) => ({
        ...prev,
        [quizKey]: [...(prev[quizKey] || updatedMessages), newTutorMsg]
      }));
      setIsTyping(false);
      setXp((prev) => prev + 10);
    }, 1200);
  };

  // Trigger Socratic Hints with Point Deductions
  const triggerTutorHint = (type: "concept" | "formula" | "clue") => {
    const alreadyUsed = usedHints.includes(type);
    if (alreadyUsed) return;

    // Determine penalty points: Concept -10, Formula -10, Clue -15
    const penalty = type === "concept" ? 10 : type === "formula" ? 10 : 15;
    
    const newScore = Math.max(10, scorePotential - penalty);
    setScorePotential(newScore);
    setUsedHints((prev) => [...prev, type]);
    setQuizSessionHints((prev) => prev + 1);

    let studentMsg = "";
    let tutorMsg = "";

    if (type === "concept") {
      studentMsg = "Can you explain the main concept behind this problem?";
      tutorMsg = `${activeQuestion.conceptHint}\n\n[System Alert: Concept Hint provided. -10 pts potential score]`;
    } else if (type === "formula") {
      studentMsg = "What formula or rule applies to this question?";
      tutorMsg = `${activeQuestion.formulaReminder}\n\n[System Alert: Rule Reminder provided. -10 pts potential score]`;
    } else {
      studentMsg = "I am stuck. Could you give me a small clue?";
      tutorMsg = `${activeQuestion.smallClue}\n\n[System Alert: Small Clue provided. -15 pts potential score]`;
    }

    const quizKey = getQuizKey();
    const currentMessages = quizChatMessages[quizKey] || [];

    const updated = [
      ...currentMessages,
      { sender: "student" as const, text: studentMsg },
      { sender: "tutor" as const, text: tutorMsg }
    ];

    setQuizChatMessages({
      ...quizChatMessages,
      [quizKey]: updated
    });
  };

  // Submit Quiz Answer (With GRE-style Weighted Scoring Calculations)
  const handleQuizSubmit = () => {
    if (!selectedOption) return;

    const correct = selectedOption === activeQuestion.correctAnswer;
    setIsCorrect(correct);
    setHasSubmitted(true);

    const basePoints = quizDifficulty === 1 ? 60 : quizDifficulty === 2 ? 80 : 100;
    const penalty = (usedHints.includes("concept") ? 10 : 0) + (usedHints.includes("formula") ? 10 : 0) + (usedHints.includes("clue") ? 15 : 0);
    const earnedPoints = correct ? Math.max(10, basePoints - penalty) : 0;

    // Track session scoring metrics
    setQuizSessionPoints((prev) => prev + earnedPoints);
    setQuizSessionMaxPoints((prev) => prev + basePoints);
    if (correct) {
      setQuizSessionCorrect((prev) => prev + 1);
    }

    // Determine gradual level progression
    let nextLevel = quizDifficulty;
    let newConsecutiveCorrect = consecutiveCorrect;
    let newConsecutiveIncorrect = consecutiveIncorrect;

    if (correct) {
      newConsecutiveCorrect += 1;
      newConsecutiveIncorrect = 0;
      if (newConsecutiveCorrect >= 2) {
        nextLevel = Math.min(3, quizDifficulty + 1);
        newConsecutiveCorrect = 0;
      }
    } else {
      newConsecutiveIncorrect += 1;
      newConsecutiveCorrect = 0;
      if (newConsecutiveIncorrect >= 2) {
        nextLevel = Math.max(1, quizDifficulty - 1);
        newConsecutiveIncorrect = 0;
      }
    }

    setConsecutiveCorrect(newConsecutiveCorrect);
    setConsecutiveIncorrect(newConsecutiveIncorrect);
    setQuizDifficulty(nextLevel);

    // Sync student quiz results to roster database (and local storage mock)
    setStudentsRoster((prevRoster) => {
      const activeUserUid = isFirebaseEnabled && auth?.currentUser ? auth.currentUser.uid : (localStorage.getItem("mock_current_user_uid") || "mock-student-alex");
      return prevRoster.map((s) => {
        if (s.id === "alex" || s.id === activeUserUid) {
          const newTotalQuestions = s.totalQuestions + 1;
          const newCorrectAnswers = s.correctAnswers + (correct ? 1 : 0);
          const newHintsUsedCount = s.hintsUsedCount + usedHints.length;
          const effortPenalty = newTotalQuestions > 0 ? (newHintsUsedCount / newTotalQuestions) * 15 : 0;
          const newEffort = Math.max(30, Math.min(100, Math.round(95 - effortPenalty)));

          // Calculate new running average Mastery Score (0-100)
          const currentRunningSum = (s.classScore !== undefined ? s.classScore : 75) * s.totalQuestions;
          const calculatedScorePercent = correct ? (earnedPoints / basePoints) * 100 : 0;
          const newClassScore = Math.max(0, Math.min(100, Math.round((currentRunningSum + calculatedScorePercent) / newTotalQuestions)));

          const newActivity = [
            {
              questionText: activeQuestion.questionText,
              level: quizDifficulty,
              userAnswer: selectedOption,
              correctAnswer: activeQuestion.correctAnswer,
              isCorrect: correct,
              hintsRequested: usedHints.length,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            },
            ...s.recentActivity
          ].slice(0, 10);

          // Update local states
          setClassScore(newClassScore);
          setGmatScore(newClassScore); // compatibility

          return {
            ...s,
            totalQuestions: newTotalQuestions,
            correctAnswers: newCorrectAnswers,
            hintsUsedCount: newHintsUsedCount,
            gmatScore: newClassScore, // store Mastery Grade in gmatScore for layout rendering
            classScore: newClassScore,
            adaptiveLevel: nextLevel,
            cognitiveEffort: newEffort,
            recentActivity: newActivity,
            lastActive: "Just now"
          };
        }
        return s;
      });
    });

    const quizKey = getQuizKey();
    const currentMessages = quizChatMessages[quizKey] || [];

    if (correct) {
      setQuizFeedback(`Correct! 🎉 You earned +${earnedPoints} pts! Academic Mastery updated.`);
      setXp((prev) => prev + earnedPoints);

      setTimeout(() => {
        setQuizChatMessages((prev) => ({
          ...prev,
          [quizKey]: [
            ...(prev[quizKey] || currentMessages),
            { 
              sender: "tutor", 
              text: `Excellent reasoning! You solved it correctly. Your class mastery score is now updated. Let's load the next challenge!` 
            }
          ]
        }));
      }, 500);

    } else {
      setQuizFeedback(`Incorrect. Check the Socratic feedback on the right to review the concept.`);
      
      setTimeout(() => {
        setQuizChatMessages((prev) => ({
          ...prev,
          [quizKey]: [
            ...(prev[quizKey] || currentMessages),
            { 
              sender: "tutor", 
              text: `Mistakes are crucial steps for mastery. Let's review the clue: ${activeQuestion.smallClue}.` 
            }
          ]
        }));
      }, 500);
    }
  };

  // Next Quiz Question (Fetches a brand new unique question on-the-fly)
  const handleNextQuizQuestion = () => {
    const nextQuestionNum = currentQuestionIndex + 1;
    
    // Check if we hit the quiz length limit
    if (nextQuestionNum > quizLengthLimit) {
      setQuizCompleted(true);
      return;
    }
    
    setCurrentQuestionIndex(nextQuestionNum);
    fetchNewQuestion(selectedSubject.id, quizDifficulty);
  };

  // Ingest notes - saves document text and clears input
  const handleIngestNotes = () => {
    if (!teacherNotes.trim()) {
      setIngestionStatus("Error: Notes field is empty. Please enter study material.");
      return;
    }

    setIngestionStatus("Ingesting study document chunks into vector indexes...");

    setTimeout(() => {
      const text = teacherNotes.toLowerCase();
      let matchedSubject = "science"; // default fallback
      if (text.includes("integral") || text.includes("limit") || text.includes("derivative") || text.includes("equation") || text.includes("calculus") || text.includes("algebra")) {
        matchedSubject = "math";
      } else if (text.includes("war") || text.includes("magna carta") || text.includes("king") || text.includes("empire") || text.includes("treaty") || text.includes("revolution")) {
        matchedSubject = "history";
      } else if (text.includes("simile") || text.includes("gatsby") || text.includes("alliteration") || text.includes("thesis") || text.includes("metaphor") || text.includes("literature") || text.includes("english")) {
        matchedSubject = "english";
      }

      const targetSub = subjectsList.find(s => s.id === matchedSubject) || subjectsList[1] || subjectsList[0];
      setSelectedSubject(targetSub);
      setSelectedPersona(targetSub.personas[0]);

      // Save note specifically under this subject key
      setTeacherSyllabusNotes((prev) => ({
        ...prev,
        [matchedSubject]: teacherNotes
      }));

      // Parse keywords for Teacher UI Summary
      const words = teacherNotes.split(/\s+/);
      const uniqueNouns = Array.from(new Set(words.filter(w => w.length > 5))).slice(0, 4);
      setExtractedEntities([targetSub.name + " Ingest", ...uniqueNouns]);
      setCurrentSourceMaterial(`Custom Upload: "${teacherNotes.substring(0, 30)}..."`);
      
      setIngestionStatus(`RAG Notes Vectorized successfully! Custom questions will generate on-demand.`);
      setTeacherNotes("");
      setQuizDifficulty(1);
      
      // Load initial question from RAG
      fetchNewQuestion(matchedSubject, 1);

      setBadges((prev) =>
        prev.map(b => b.name === "Time Traveler" ? { ...b, unlocked: true } : b)
      );
    }, 1500);
  };

  const loadPresetNotes = (type: "photosynthesis" | "calculus") => {
    if (type === "photosynthesis") {
      setTeacherNotes(
        "Photosynthesis is the process by which plants use sunlight to synthesize foods from carbon dioxide and water. In plants, photosynthesis takes place in chloroplasts. Light-dependent reactions happen in the thylakoid membranes where light is absorbed by chlorophyll to make ATP and NADPH, releasing oxygen. Light-independent reactions (Calvin Cycle) take place in the stroma, using ATP and NADPH to fix carbon dioxide and produce glucose (C6H12O6)."
      );
    } else {
      setTeacherNotes(
        "A limit is the value that a function approaches as the input approaches some value. The derivative of a function represents its instantaneous rate of change. It is defined as the limit as h approaches 0 of [f(x+h) - f(x)] / h. The Power Rule states that d/dx[x^n] = n*x^(n-1). For example, the derivative of x³ is 3x²."
      );
    }
    setIngestionStatus("");
  };

  const loadUploaderPreset = (presetName: "calculus" | "photosynthesis" | "magnacarta" | "romeo") => {
    setIngestionStatus("");
    if (presetName === "calculus") {
      setUploadSubject("math");
      setUploadTitle("Calculus_Limits_Chapter1.pdf");
      setUploadType("pdf");
      setUploadContent("A limit is the value that a function approaches as the input approaches some value. The derivative of a function represents its instantaneous rate of change. It is defined as the limit as h approaches 0 of [f(x+h) - f(x)] / h. The Power Rule states that d/dx[x^n] = n*x^(n-1). For example, the derivative of x³ is 3x².");
    } else if (presetName === "photosynthesis") {
      setUploadSubject("science");
      setUploadTitle("Photosynthesis_Slide_Diagram.png");
      setUploadType("image");
      setUploadContent("Photosynthesis is the process by which plants use sunlight to synthesize foods from carbon dioxide and water. In plants, photosynthesis takes place in chloroplasts. Light-dependent reactions happen in the thylakoid membranes where light is absorbed by chlorophyll to make ATP and NADPH, releasing oxygen. Light-independent reactions (Calvin Cycle) take place in the stroma, using ATP and NADPH to fix carbon dioxide and produce glucose (C6H12O6).");
    } else if (presetName === "magnacarta") {
      setUploadSubject("history");
      setUploadTitle("Magna_Carta_Historical_Overview.pdf");
      setUploadType("pdf");
      setUploadContent("The Magna Carta was signed by King John of England in 1215. It established the principle that everyone, including the king, is subject to the law, and guarantees the rights of individuals, the right to justice, and the right to a fair trial. It was meant to limit royal tyranny and protect nobility rights.");
    } else if (presetName === "romeo") {
      setUploadSubject("english");
      setUploadTitle("Romeo_Juliet_Act_I_Analysis.pdf");
      setUploadType("pdf");
      setUploadContent("In Act I of Shakespeare's Romeo and Juliet, the themes of love and fate are established. The prologue outlines the ancient grudge between the Capulets and Montagues. Romeo is introduced as a melancholy lover, pining for Rosaline before meeting Juliet at the Capulet ball, setting their star-crossed destiny in motion.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedRawFile(file);
    setUploadTitle(file.name);
    
    // Auto-select type based on extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      setUploadType('pdf');
      setUploadContent("PDF File Content (Binary to be parsed on backend)");
    } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
      setUploadType('image');
      setUploadContent("Image File Content (Binary slides to be parsed)");
    } else {
      setUploadType('notes');
      // Read text file client-side so they see it
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setUploadContent(text);
      };
      reader.readAsText(file);
    }
    setIngestionStatus(`Selected file: "${file.name}". Click 'Ingest Syllabus Document' to vectorize.`);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setSelectedRawFile(file);
    setUploadTitle(file.name);

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      setUploadType('pdf');
      setUploadContent("PDF File Content (Binary to be parsed on backend)");
    } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
      setUploadType('image');
      setUploadContent("Image File Content (Binary slides to be parsed)");
    } else {
      setUploadType('notes');
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setUploadContent(text);
      };
      reader.readAsText(file);
    }
    setIngestionStatus(`Selected file: "${file.name}". Click 'Ingest Syllabus Document' to vectorize.`);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleUploadAndIngest = () => {
    if (!uploadTitle.trim() || !uploadContent.trim()) {
      setIngestionStatus("Error: Please provide both a title and document contents.");
      return;
    }

    setIsUploadingMock(true);
    setUploadProgress(0);
    setIngestionStatus("Scanned OCR data detected. Uploading and indexing document into classroom course materials...");

    let progress = 0;
    const interval = setInterval(async () => {
      progress += 25;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);

        try {
          const matchedSub = uploadSubject;
          const cleanTitle = uploadTitle.endsWith(".pdf") || uploadTitle.endsWith(".png") || uploadTitle.endsWith(".txt")
            ? uploadTitle
            : `${uploadTitle}.${uploadType === "pdf" ? "pdf" : uploadType === "image" ? "png" : "txt"}`;

          let res;
          if (selectedRawFile) {
            console.log("Ingesting raw file via multipart Form Data upload...");
            const formData = new FormData();
            formData.append("courseId", matchedSub);
            formData.append("moduleId", uploadModuleId || "");
            formData.append("title", cleanTitle);
            formData.append("file", selectedRawFile);
            
            res = await fetch("/api/ingest", {
              method: "POST",
              body: formData,
            });
          } else {
            console.log("Ingesting text contents via JSON payload...");
            res = await fetch("/api/ingest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                courseId: matchedSub,
                moduleId: uploadModuleId || undefined,
                title: cleanTitle,
                content: uploadContent,
              })
            });
          }

          if (!res.ok) {
            throw new Error(`API Ingest returned status ${res.status}`);
          }

          const resData = await res.json();
          console.log("Ingestion response:", resData);

          const finalContent = resData.extractedText || uploadContent;

          const newMaterial: CourseMaterial = {
            id: `uploaded-${Date.now()}`,
            title: cleanTitle,
            type: uploadType,
            content: finalContent,
            uploadedAt: new Date().toISOString().split("T")[0],
            fileSize: finalContent.length > 1024 ? `${Math.round(finalContent.length / 1024)} KB` : "1 KB",
            isActive: true,
            moduleId: uploadModuleId || undefined,
            isChroma: resData.isChroma
          };

          // Append to state
          setCourseMaterials((prev) => {
            const subjectMaterials = prev[matchedSub] || [];
            const deactivated = subjectMaterials.map(m => ({ ...m, isActive: false }));
            return {
              ...prev,
              [matchedSub]: [...deactivated, newMaterial]
            };
          });

          // Sync legacy state
          setTeacherSyllabusNotes((prev) => ({
            ...prev,
            [matchedSub]: finalContent
          }));

          const targetSub = subjectsList.find(s => s.id === matchedSub) || subjectsList[0];
          setSelectedSubject(targetSub);
          setSelectedPersona(targetSub.personas[0]);

          // Parse Entities
          const words = finalContent.split(/\s+/);
          const uniqueNouns: string[] = Array.from(new Set<string>(words.filter((w: string) => w.length > 5))).slice(0, 4);
          setExtractedEntities([targetSub.name + " Ingest", ...uniqueNouns]);
          setCurrentSourceMaterial(`Upload: "${cleanTitle}"`);

          setIngestionStatus(`Document uploaded successfully! ${resData.isChroma ? "ChromaDB vectorized index updated" : "Cached in browser fallback store"}.`);
          setIsUploadingMock(false);
          setUploadProgress(null);
          setUploadTitle("");
          setUploadContent("");
          setSelectedRawFile(null);

          // Load first question in Quiz
          fetchNewQuestion(matchedSub, 1, undefined, uploadModuleId || undefined);
          setQuizDifficulty(1);

          setBadges((prev) =>
            prev.map(b => b.name === "Time Traveler" ? { ...b, unlocked: true } : b)
          );
        } catch (err: any) {
          console.error("API Ingest failed, falling back to local indexing:", err);
          const matchedSub = uploadSubject;
          const cleanTitle = uploadTitle.endsWith(".pdf") || uploadTitle.endsWith(".png") || uploadTitle.endsWith(".txt")
            ? uploadTitle
            : `${uploadTitle}.${uploadType === "pdf" ? "pdf" : uploadType === "image" ? "png" : "txt"}`;

          const newMaterial: CourseMaterial = {
            id: `uploaded-${Date.now()}`,
            title: cleanTitle,
            type: uploadType,
            content: uploadContent,
            uploadedAt: new Date().toISOString().split("T")[0],
            fileSize: "8 KB",
            isActive: true,
            moduleId: uploadModuleId || undefined,
            isChroma: false
          };

          setCourseMaterials((prev) => {
            const subjectMaterials = prev[matchedSub] || [];
            const deactivated = subjectMaterials.map(m => ({ ...m, isActive: false }));
            return {
              ...prev,
              [matchedSub]: [...deactivated, newMaterial]
            };
          });

          setIngestionStatus("Uploaded document successfully (Indexed in browser fallback).");
          setIsUploadingMock(false);
          setUploadProgress(null);
          setUploadTitle("");
          setUploadContent("");
          setSelectedRawFile(null);
          
          fetchNewQuestion(matchedSub, 1, undefined, uploadModuleId || undefined);
          setQuizDifficulty(1);
        }
      }
    }, 200);
  };

  const handleDeleteMaterial = (subjectId: string, id: string) => {
    setCourseMaterials((prev) => {
      const subjectMaterials = prev[subjectId] || [];
      const updated = subjectMaterials.filter(m => m.id !== id);
      return {
        ...prev,
        [subjectId]: updated
      };
    });
  };

  const handleToggleMaterialRAG = (subjectId: string, id: string) => {
    setCourseMaterials((prev) => {
      const subjectMaterials = prev[subjectId] || [];
      const updated = subjectMaterials.map(m => {
        if (m.id === id) {
          return { ...m, isActive: !m.isActive };
        }
        return m;
      });
      return {
        ...prev,
        [subjectId]: updated
      };
    });
  };

  const handleSubjectChange = (sub: SubjectConfig) => {
    setSelectedSubject(sub);
    setSelectedPersona(sub.personas[0]);
    const firstModule = sub.modules?.[0]?.id || null;
    setSelectedModuleForPractice(firstModule);
    if (activeTab === "quiz") {
      fetchNewQuestion(sub.id, quizDifficulty, undefined, firstModule || undefined);
    }
  };

  // Filter flashcards
  const subjectFlashcards = flashcards.filter(c => c.subject === selectedSubject.id);
  const activeFlashcard = subjectFlashcards[currentCardIndex] || null;

  const handleNextCard = () => {
    setFlippedCardId(null);
    setTimeout(() => {
      setCurrentCardIndex((prev) => (prev < subjectFlashcards.length - 1 ? prev + 1 : 0));
    }, 150);
  };

  const handleCardMastered = () => {
    setXp((prev) => prev + 25);
    handleNextCard();
  };

  return (
    <div className="flex h-screen w-screen bg-[#07070a] text-foreground font-sans overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0a0a0f] border-r border-white/5 p-6 justify-between shrink-0">
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-md shadow-primary/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Aether<span className="text-secondary">AI</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            {userRole === "student" ? (
              <>
                <button
                  onClick={() => setActiveTab("quiz")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "quiz" 
                      ? "bg-white/5 text-white border border-white/5" 
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Practice Quiz
                </button>
                <button
                  onClick={() => {
                    setActiveTab("courses");
                    setSelectedCourseForBoard(null);
                    setSelectedMaterialForPreview(null);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "courses" 
                      ? "bg-white/5 text-white border border-white/5" 
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  My Courses
                </button>
                <button
                  onClick={() => setActiveTab("progress")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "progress" 
                      ? "bg-white/5 text-white border border-white/5" 
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2zm9-1a1 1 0 011-1h1a1 1 0 011 1v3a1 1 0 01-1 1h-1a1 1 0 01-1-1v-3z" />
                  </svg>
                  Achievements
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setActiveTab("gradebook")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "gradebook" 
                      ? "bg-white/5 text-white border border-white/5" 
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0-.001h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Student Roster
                </button>
                <button
                  onClick={() => setActiveTab("teacher")}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === "teacher" 
                      ? "bg-white/5 text-white border border-white/5" 
                      : "text-muted-foreground hover:text-white hover:bg-white/5"
                  }`}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  </svg>
                  Course Materials
                </button>
              </>
            )}
          </nav>
        </div>

        {/* User Card */}
        {userRole === "student" ? (
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-3.5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-sm shrink-0">
                {currentUserName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "AM"}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{currentUserName}</div>
                <div className="text-[10px] text-muted-foreground truncate">{currentUserEmail}</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted-foreground">Level 4 Scholar</span>
                <span className="text-white">{xp} / 500 XP</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
                  style={{ width: `${(xp % 500) / 5}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-white/5 font-semibold">
                <span>Streak: {streak} days 🔥</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl p-4 border border-white/5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-lg shrink-0">
                🎓
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{currentUserName}</div>
                <div className="text-[10px] text-muted-foreground truncate">{currentUserEmail}</div>
              </div>
            </div>
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
              <span>Managed Courses: {subjectsList.length}</span>
              <span>Roster size: {studentsRoster.length}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Decorative Glow */}
        <div 
          className="glow-spot absolute w-[400px] h-[400px] pointer-events-none transition-all duration-500" 
          style={{ 
            top: "5%", 
            right: "5%", 
            backgroundColor: selectedSubject.themeColor === "violet" ? "rgba(139, 92, 246, 0.2)" : 
                            selectedSubject.themeColor === "cyan" ? "rgba(6, 182, 212, 0.2)" : 
                            selectedSubject.themeColor === "amber" ? "rgba(245, 158, 11, 0.2)" : 
                            selectedSubject.themeColor === "rose" ? "rgba(244, 63, 94, 0.2)" :
                            selectedSubject.themeColor === "emerald" ? "rgba(16, 185, 129, 0.2)" : 
                            "rgba(59, 130, 246, 0.2)",
            filter: "blur(100px)"
          }}
        />

        {/* Top Header */}
        <header className="h-16 border-b border-white/5 px-6 flex items-center justify-between bg-[#07070a]/60 backdrop-blur-md z-10 shrink-0">
          
          {/* Section title */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-white tracking-wide">
              {activeTab === "chat" ? (userRole === "teacher" ? "Tutor Playground" : "Socratic Study Desk") : 
               activeTab === "quiz" ? "Adaptive GMAT/GRE Desk" :
               activeTab === "teacher" ? "Course Materials Panel" :
               activeTab === "gradebook" ? "Student Roster & Gradebook" :
               activeTab === "courses" ? "My Course Materials" : "Achievements & Progress"}
            </span>
          </div>

          {/* Quick Subject Tabs */}
          <div className="flex items-center gap-1.5 bg-white/5 rounded-xl p-1 border border-white/5">
            {subjectsList.map((sub) => {
              const isActive = selectedSubject.id === sub.id;
              
              let bgActiveColor = "bg-violet-600 text-white";
              if (sub.themeColor === "science" || sub.themeColor === "cyan") bgActiveColor = "bg-cyan-600 text-white";
              else if (sub.themeColor === "history" || sub.themeColor === "amber") bgActiveColor = "bg-amber-600 text-white";
              else if (sub.themeColor === "english" || sub.themeColor === "rose") bgActiveColor = "bg-rose-600 text-white";
              else if (sub.themeColor === "emerald" || sub.themeColor === "green") bgActiveColor = "bg-emerald-600 text-white";
              else if (sub.themeColor === "blue" || sub.themeColor === "indigo") bgActiveColor = "bg-blue-600 text-white";

              return (
                <button
                  key={sub.id}
                  onClick={() => handleSubjectChange(sub)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive ? bgActiveColor : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            {/* Firebase connection status badge */}
            {isFirebaseEnabled ? (
              <span className="hidden sm:flex text-[9px] px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold items-center gap-1.5 tracking-wider uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Firebase
              </span>
            ) : (
              <span className="hidden sm:flex text-[9px] px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold items-center gap-1.5 tracking-wider uppercase">
                ⚠️ Local Mock
              </span>
            )}

            {/* Demo Role Switcher Capsule Control */}
            <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5 shadow-inner">
              <button
                onClick={() => handleRoleSwitch("student")}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all duration-200 ${
                  userRole === "student"
                    ? "bg-secondary text-white shadow-md shadow-secondary/15"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                🎒 Student Demo
              </button>
              <button
                onClick={() => handleRoleSwitch("teacher")}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all duration-200 ${
                  userRole === "teacher"
                    ? "bg-primary text-white shadow-md shadow-primary/15"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                🎓 Teacher Demo
              </button>
            </div>

            <button
              onClick={async () => {
                if (isFirebaseEnabled && auth) {
                  try {
                    await signOut(auth);
                  } catch (e) {
                    console.error("Sign out failed:", e);
                  }
                }
                localStorage.removeItem("user_role");
                router.push("/");
              }}
              className="text-xs font-medium text-muted-foreground hover:text-white transition-colors"
            >
              Log Out
            </button>
          </div>
        </header>

        {/* Tab Contents */}
        <div className="flex-1 overflow-hidden relative z-10">
          <AnimatePresence mode="wait">
            
            {/* CHAT TAB */}
            {activeTab === "chat" && (
              <motion.div
                key="chat-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full flex flex-col lg:flex-row"
              >
                {/* Chat Feed */}
                <div className="flex-1 flex flex-col h-full min-w-0 border-r border-white/5">
                  
                  {/* Persona Indicator bar */}
                  <div className="px-6 py-3 border-b border-white/5 bg-[#0a0a0f]/40 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{selectedPersona.avatar}</span>
                      <div>
                        <h4 className="text-sm font-bold text-white leading-none">{selectedPersona.name}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedPersona.role}</p>
                      </div>
                    </div>
                    {/* Persona Toggle */}
                    <div className="flex items-center gap-1.5 bg-white/5 rounded-lg p-0.5 border border-white/5">
                      {selectedSubject.personas.map((per) => (
                        <button
                          type="button"
                          key={per.id}
                          onClick={() => setSelectedPersona(per)}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                            selectedPersona.id === per.id
                              ? "bg-white/10 text-white"
                              : "text-muted-foreground hover:text-white"
                          }`}
                        >
                          {per.name.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Messages Feed */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {activeMessages.map((msg, index) => (
                      <div 
                        key={index}
                        className={`flex ${msg.sender === "student" ? "justify-end" : "justify-start"}`}
                      >
                        <div className="max-w-[80%] flex gap-3">
                          {msg.sender === "tutor" && (
                            <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sm shrink-0">
                              {selectedPersona.avatar}
                            </div>
                          )}
                          <div 
                            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                              msg.sender === "student"
                                ? selectedSubject.id === "math" ? "bg-violet-600 text-white rounded-tr-none shadow-md shadow-violet-600/10" :
                                  selectedSubject.id === "science" ? "bg-cyan-600 text-white rounded-tr-none shadow-md shadow-cyan-600/10" :
                                  selectedSubject.id === "history" ? "bg-amber-600 text-white rounded-tr-none shadow-md shadow-amber-600/10" :
                                  "bg-rose-600 text-white rounded-tr-none shadow-md shadow-rose-600/10"
                                : "glass-panel text-zinc-100 rounded-tl-none border border-white/5"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    {/* Simulated Typing Indicator */}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="flex gap-3">
                          <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-sm shrink-0">
                            {selectedPersona.avatar}
                          </div>
                          <div className="glass-panel rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Suggestions Prompts */}
                  <div className="px-6 py-3 border-t border-white/5 bg-[#0a0a0f]/20 flex flex-wrap gap-2">
                    {(SUGGESTIONS[selectedSubject.id] || [
                      `What are the core concepts of ${selectedSubject.name}?`,
                      `How do I apply ${selectedSubject.name} in practice?`,
                      `What is the history behind ${selectedSubject.name}?`
                    ]).map((sug, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleSendNormalMessage(sug)}
                        className="text-xs text-muted-foreground bg-white/5 border border-white/5 rounded-full px-3 py-1.5 hover:bg-white/10 hover:text-white transition-all"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>

                  {/* Input Box */}
                  <div className="p-4 border-t border-white/5 bg-[#07070a] flex items-center gap-3">
                    <input
                      type="text"
                      placeholder={`Ask ${selectedPersona.name} a question...`}
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendNormalMessage()}
                      className="flex-1 rounded-xl px-4 py-3.5 text-sm glass-input focus:outline-none transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendNormalMessage()}
                      className={`h-11 w-11 rounded-xl flex items-center justify-center text-white shadow-md transition-all shrink-0 hover:scale-[1.03] ${
                        selectedSubject.id === "math" ? "bg-violet-600 hover:shadow-violet-600/10" :
                        selectedSubject.id === "science" ? "bg-cyan-600 hover:shadow-cyan-600/10" :
                        selectedSubject.id === "history" ? "bg-amber-600 hover:shadow-amber-600/10" :
                        "bg-rose-600 hover:shadow-rose-600/10"
                      }`}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>

                </div>

                {/* Right Panel: Subject Stats & Info */}
                <div className="hidden lg:flex flex-col w-80 p-6 space-y-6 shrink-0 bg-[#0a0a0f]/40 overflow-y-auto">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Curriculum Focus</h3>
                    <p className="text-xs text-muted-foreground">Selectable sub-modules for {selectedSubject.name}.</p>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      { title: "Module 1: Foundations", status: "Completed 100%" },
                      { title: "Module 2: Intermediate Analysis", status: "Active (54%)" },
                      { title: "Module 3: Advanced Concepts", status: "Locked" }
                    ].map((m, idx) => (
                      <div key={idx} className="glass-panel p-3.5 rounded-xl border border-white/5 flex flex-col gap-2 hover:bg-[#12121c]/40 transition-colors">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-white">{m.title}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{m.status}</span>
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              selectedSubject.id === "math" ? "bg-violet-600" :
                              selectedSubject.id === "science" ? "bg-cyan-600" :
                              selectedSubject.id === "history" ? "bg-amber-600" : "bg-rose-600"
                            }`} 
                            style={{ width: m.status.includes("100") ? "100%" : m.status.includes("54") ? "54%" : "0%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Concept Vault */}
                  <div className="pt-6 border-t border-white/5 space-y-3">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Saved Concepts</h3>
                    <p className="text-xs text-muted-foreground">Key learnings logged by your AI tutor during conversation.</p>
                    <div className="space-y-2">
                      {INITIAL_FLASHCARDS.filter(c => c.subject === selectedSubject.id).map((c, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-zinc-300">
                          <span className="text-secondary">✦</span>
                          <span>{c.front}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </motion.div>
            )}

            {/* ADAPTIVE QUIZ TAB */}
            {activeTab === "quiz" && (
              <motion.div
                key="quiz-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full flex flex-col overflow-y-auto p-6 md:p-8 bg-[#0a0a0f]/20"
              >
                
                <div className="max-w-3xl mx-auto w-full space-y-6 flex flex-col justify-between min-h-[80vh]">
                  
                  {quizCompleted ? (
                    /* Final Quiz Session Summary Screen */
                    <div className="flex-1 flex flex-col justify-center items-center py-8 px-4 text-center space-y-6 max-w-lg mx-auto">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl shadow-lg shadow-primary/20 animate-bounce">
                        🎓
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-black text-white tracking-tight">Quiz Session Complete!</h2>
                        <p className="text-sm text-muted-foreground">
                          You have completed the adaptive practice quiz session for <span className="text-white font-semibold">{selectedSubject.name}</span>.
                        </p>
                      </div>
                      
                      {/* Detailed Stats Grid */}
                      <div className="grid grid-cols-2 gap-4 w-full pt-4">
                        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-center items-center">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Academic Mastery Grade</span>
                          <span className="text-3xl font-black text-emerald-400 mt-1">{classScore}%</span>
                          <span className="text-[9px] text-muted-foreground/60 mt-1">Class Standing Score</span>
                        </div>
                        
                        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-center items-center">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Accuracy</span>
                          <span className="text-3xl font-black text-primary mt-1">
                            {quizSessionCorrect} / {quizLengthLimit}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60 mt-1">
                            {quizLengthLimit > 0 ? Math.round((quizSessionCorrect / quizLengthLimit) * 100) : 0}% Correct
                          </span>
                        </div>

                        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-center items-center">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Hints Requested</span>
                          <span className="text-2xl font-bold text-amber-400 mt-1">{quizSessionHints}</span>
                          <span className="text-[9px] text-muted-foreground/60 mt-1">Points deducted for help</span>
                        </div>

                        <div className="glass-panel p-4 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-center items-center">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Score Payout</span>
                          <span className="text-2xl font-bold text-violet-400 mt-1">{quizSessionPoints}</span>
                          <span className="text-[9px] text-muted-foreground/60 mt-1">out of {quizSessionMaxPoints} max XP</span>
                        </div>
                      </div>

                      {/* Instructor Action Info */}
                      {instructorName && (
                        <p className="text-[11px] text-muted-foreground italic bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                          Your progress and grade reports have been synced with your instructor, <span className="text-white font-medium">{instructorName}</span>.
                        </p>
                      )}

                      {/* Control Buttons */}
                      <div className="flex gap-4 w-full pt-4">
                        <button
                          onClick={() => {
                            setCurrentQuestionIndex(1);
                            setQuizCompleted(false);
                            setQuizSessionPoints(0);
                            setQuizSessionMaxPoints(0);
                            setQuizSessionCorrect(0);
                            setQuizSessionHints(0);
                            setConsecutiveCorrect(0);
                            setConsecutiveIncorrect(0);
                            fetchNewQuestion(selectedSubject.id, quizDifficulty, undefined, selectedModuleForPractice || undefined);
                          }}
                          className={`flex-1 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.01] ${
                            selectedSubject.id === "math" ? "bg-violet-600 shadow-violet-600/10" :
                            selectedSubject.id === "science" ? "bg-cyan-600 shadow-cyan-600/10" :
                            selectedSubject.id === "history" ? "bg-amber-600 shadow-amber-600/10" :
                            "bg-rose-600 shadow-rose-600/10"
                          }`}
                        >
                          🔄 Start New Session
                        </button>
                        <button
                          onClick={() => setActiveTab("courses")}
                          className="flex-1 py-3.5 rounded-xl text-sm font-bold text-white border border-white/10 bg-white/5 hover:bg-white/10 transition-all hover:scale-[1.01]"
                        >
                          📚 Return to Courses
                        </button>
                      </div>
                    </div>
                  ) : isLoadingQuestion ? (
                    /* Loading Skeleton while generating dynamic question */
                    <div className="flex-1 flex flex-col justify-center items-center space-y-6 min-h-[300px]">
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary animate-bounce shadow-lg">
                        <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                      <div className="text-center space-y-2">
                        <h4 className="text-sm font-bold text-white">Generating unique adaptive question...</h4>
                        <p className="text-xs text-muted-foreground">Retrieving vector chunks and aligning syllabus difficulty.</p>
                      </div>
                    </div>
                  ) : (
                    /* Active Quiz Content */
                    <>
                      <div className="space-y-6">

                        {/* Teacher assigned quiz notification */}
                        {assignedQuizTask && (
                          <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 space-y-3 relative overflow-hidden shadow-lg">
                            <div className="absolute top-0 right-0 h-1.5 w-full bg-gradient-to-r from-primary to-secondary animate-pulse" />
                            <div className="flex items-start gap-3">
                              <div className="text-2xl mt-0.5">🎓</div>
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-white tracking-wide">
                                  Pinned Assignment: {subjectsList.find(s => s.id === assignedQuizTask.subject)?.name} Custom Quiz
                                </h4>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                  Professor Emily Vance assigned: <span className="text-white font-semibold">"{assignedQuizTask.focus}"</span> (Difficulty Level {assignedQuizTask.level})
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => {
                                  const assignedSubject = subjectsList.find(s => s.id === assignedQuizTask.subject);
                                  if (assignedSubject) {
                                    setSelectedSubject(assignedSubject);
                                    setSelectedPersona(assignedSubject.personas[0]);
                                    setQuizDifficulty(assignedQuizTask.level);
                                    setQuizLengthLimit(assignedQuizTask.maxQuestions || 10);
                                    setCurrentQuestionIndex(1);
                                    setQuizCompleted(false);
                                    setQuizSessionPoints(0);
                                    setQuizSessionMaxPoints(0);
                                    setQuizSessionCorrect(0);
                                    setQuizSessionHints(0);
                                    
                                    const firstMod = assignedSubject.modules?.[0]?.id || null;
                                    setSelectedModuleForPractice(firstMod);
                                    fetchNewQuestion(assignedQuizTask.subject, assignedQuizTask.level, `Custom assignment focus: ${assignedQuizTask.focus}`, firstMod || undefined);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white transition-all"
                              >
                                📝 Start Assigned Quiz
                              </button>
                              <button
                                onClick={() => setAssignedQuizTask(null)}
                                className="px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[10px] text-muted-foreground hover:text-white transition-all"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {/* Header Details */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/2 p-4 rounded-xl border border-white/5 shadow-md">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                                {selectedSubject.name} Practice Quiz
                              </span>
                              <select
                                value={selectedModuleForPractice || ""}
                                onChange={(e) => {
                                  const modId = e.target.value || null;
                                  setSelectedModuleForPractice(modId);
                                  setCurrentQuestionIndex(1);
                                  setQuizCompleted(false);
                                  setQuizSessionPoints(0);
                                  setQuizSessionMaxPoints(0);
                                  setQuizSessionCorrect(0);
                                  setQuizSessionHints(0);
                                  setConsecutiveCorrect(0);
                                  setConsecutiveIncorrect(0);
                                  fetchNewQuestion(selectedSubject.id, quizDifficulty, undefined, modId || undefined);
                                }}
                                className="text-[10px] font-extrabold glass-input rounded-md px-2.5 py-1 focus:outline-none bg-[#0e0e15] text-zinc-300 hover:text-white transition-all cursor-pointer border border-white/10"
                              >
                                {(selectedSubject.modules || []).map((mod) => (
                                  <option key={mod.id} value={mod.id}>
                                    {mod.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <span className="text-[10px] text-muted-foreground leading-none">
                              Question {currentQuestionIndex} of {quizLengthLimit}
                            </span>
                            <div className="w-24 bg-white/5 h-1 rounded-full overflow-hidden mt-0.5">
                              <div className="bg-primary h-full transition-all duration-300" style={{ width: `${(currentQuestionIndex / quizLengthLimit) * 100}%` }} />
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                              quizDifficulty === 1 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                              quizDifficulty === 2 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                              "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            }`}>
                              Level {quizDifficulty}: {
                                quizDifficulty === 1 ? "Beginner" :
                                quizDifficulty === 2 ? "Intermediate" : "Advanced"
                              }
                            </span>

                            <div className="flex items-center gap-2 text-[10px]">
                              {/* Level Up Dots */}
                              <div className="flex items-center gap-1 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/10">
                                <span className="text-emerald-400">Next Level:</span>
                                <div className="flex gap-1">
                                  <span className={`h-1.5 w-1.5 rounded-full ${consecutiveCorrect >= 1 ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                                  <span className={`h-1.5 w-1.5 rounded-full ${consecutiveCorrect >= 2 ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                                </div>
                              </div>
                              {/* Level Down Dots */}
                              <div className="flex items-center gap-1 bg-rose-500/5 px-2 py-1 rounded border border-rose-500/10">
                                <span className="text-rose-400">Risk Down:</span>
                                <div className="flex gap-1">
                                  <span className={`h-1.5 w-1.5 rounded-full ${consecutiveIncorrect >= 1 ? "bg-rose-400" : "bg-white/20"}`} />
                                  <span className={`h-1.5 w-1.5 rounded-full ${consecutiveIncorrect >= 2 ? "bg-rose-400" : "bg-white/20"}`} />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Mastery Score Gauge & Question Point Potential */}
                        <div className="grid grid-cols-2 gap-4">
                          
                          {/* Mastery Grade Gauge */}
                          <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col justify-between bg-gradient-to-br from-indigo-500/10 to-transparent">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Academic Mastery Grade</span>
                            <div className="flex items-baseline gap-2 mt-2">
                              <span className="text-2xl font-black text-white">{classScore}%</span>
                              <span className="text-xs text-muted-foreground font-semibold">Mastery</span>
                            </div>
                            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-2">
                              <div className="bg-primary h-full transition-all duration-500" style={{ width: `${classScore}%` }} />
                            </div>
                          </div>

                          {/* Question Point Potential */}
                          <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col justify-between">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Question XP Potential</span>
                              <span className={`text-[10px] font-bold ${scorePotential > 60 ? "text-emerald-400" : scorePotential > 30 ? "text-amber-400" : "text-rose-400"}`}>
                                {scorePotential} XP
                              </span>
                            </div>
                            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-3.5">
                              <div 
                                className={`h-full transition-all duration-300 ${
                                  scorePotential > 60 ? "bg-emerald-500" : 
                                  scorePotential > 30 ? "bg-amber-500" : "bg-rose-500"
                                }`}
                                style={{ width: `${(scorePotential / (activeQuestion.level === 1 ? 60 : activeQuestion.level === 2 ? 80 : 100)) * 100}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground/60 leading-none mt-2">Hints deduct points from XP payout</span>
                          </div>

                        </div>

                        {/* Socratic Hint Buttons Toolbar */}
                        <div className="bg-white/2 p-4 rounded-xl border border-white/5 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Need assistance?</span>
                            <span className="text-[9px] text-muted-foreground/60">Study problem solving, not memorizing</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                triggerTutorHint("concept");
                                setActiveHintText(`💡 Concept Hint: ${activeQuestion.conceptHint}`);
                              }}
                              disabled={usedHints.includes("concept") || isLoadingQuestion || hasSubmitted}
                              className={`flex flex-col items-center justify-center py-2 rounded-lg border text-[10px] font-bold transition-all gap-1 ${
                                usedHints.includes("concept")
                                  ? "border-white/5 bg-white/2 opacity-35 cursor-not-allowed text-muted-foreground"
                                  : "border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 text-violet-300 hover:text-white"
                              }`}
                            >
                              <span>Concept</span>
                              <span className="text-[8px] text-violet-400 font-medium font-mono leading-none">-10 XP</span>
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => {
                                triggerTutorHint("formula");
                                setActiveHintText(`🔍 Formula Reminder: ${activeQuestion.formulaReminder}`);
                              }}
                              disabled={usedHints.includes("formula") || isLoadingQuestion || hasSubmitted}
                              className={`flex flex-col items-center justify-center py-2 rounded-lg border text-[10px] font-bold transition-all gap-1 ${
                                usedHints.includes("formula")
                                  ? "border-white/5 bg-white/2 opacity-35 cursor-not-allowed text-muted-foreground"
                                  : "border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-300 hover:text-white"
                              }`}
                            >
                              <span>Formula</span>
                              <span className="text-[8px] text-cyan-400 font-medium font-mono leading-none">-10 XP</span>
                            </button>
                            
                            <button
                              type="button"
                              onClick={() => {
                                triggerTutorHint("clue");
                                setActiveHintText(`🧩 Small Clue: ${activeQuestion.smallClue}`);
                              }}
                              disabled={usedHints.includes("clue") || isLoadingQuestion || hasSubmitted}
                              className={`flex flex-col items-center justify-center py-2 rounded-lg border text-[10px] font-bold transition-all gap-1 ${
                                usedHints.includes("clue")
                                  ? "border-white/5 bg-white/2 opacity-35 cursor-not-allowed text-muted-foreground"
                                  : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 hover:text-white"
                              }`}
                            >
                              <span>Small Clue</span>
                              <span className="text-[8px] text-amber-400 font-medium font-mono leading-none">-15 XP</span>
                            </button>
                          </div>

                          {/* Active Hint Text Panel */}
                          {activeHintText && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="p-3.5 rounded-lg text-xs leading-relaxed border border-white/10 bg-[#0e0e15]/60 text-zinc-100 mt-2"
                            >
                              {activeHintText}
                            </motion.div>
                          )}
                        </div>

                        {/* Quiz Question Card */}
                        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-white/10 space-y-6 relative overflow-hidden bg-card/25 shadow-xl">
                          <h3 className="text-lg sm:text-xl font-bold text-white leading-relaxed">
                            {activeQuestion.questionText}
                          </h3>
                          
                          {/* Options Radio List */}
                          <div className="space-y-3.5">
                            {activeQuestion.options.map((opt, idx) => {
                              const optionLetter = ["A", "B", "C", "D"][idx];
                              const isSelected = selectedOption === opt;
                              const isOptCorrect = opt === activeQuestion.correctAnswer;
                              
                              let cardStyle = "border-white/5 bg-white/2 hover:bg-white/5 hover:border-white/10";
                              let badgeStyle = "bg-white/5 text-muted-foreground border-white/5";

                              if (isSelected) {
                                badgeStyle = "bg-primary text-white border-primary";
                                cardStyle = "border-primary bg-primary/5";
                              }

                              if (hasSubmitted) {
                                if (isOptCorrect) {
                                  cardStyle = "border-emerald-500 bg-emerald-500/10 text-white";
                                  badgeStyle = "bg-emerald-500 text-white border-emerald-500";
                                } else if (isSelected) {
                                  cardStyle = "border-red-500 bg-red-500/10 text-white";
                                  badgeStyle = "bg-red-500 text-white border-red-500";
                                } else {
                                  cardStyle = "border-white/5 bg-white/2 opacity-40 cursor-not-allowed";
                                }
                              }

                              return (
                                <button
                                  key={idx}
                                  disabled={hasSubmitted}
                                  onClick={() => setSelectedOption(opt)}
                                  className={`w-full text-left flex items-center gap-4 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all border ${cardStyle}`}
                                >
                                  <span className={`h-7 w-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 ${badgeStyle}`}>
                                    {optionLetter}
                                  </span>
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Feedback Alerts */}
                        {quizFeedback && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-4 rounded-xl text-xs font-semibold border ${
                              isCorrect
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                                : "bg-red-500/15 text-red-400 border-red-500/25"
                            }`}
                          >
                            {quizFeedback}
                          </motion.div>
                        )}
                      </div>

                      {/* Submission and Progression Controls */}
                      <div className="pt-6 border-t border-white/5 flex gap-4 mt-6">
                        {!hasSubmitted ? (
                          <button
                            onClick={handleQuizSubmit}
                            disabled={!selectedOption || isLoadingQuestion}
                            className={`flex-1 py-4 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.01] disabled:opacity-40 ${
                              selectedSubject.id === "math" ? "bg-violet-600 shadow-violet-600/10" :
                              selectedSubject.id === "science" ? "bg-cyan-600 shadow-cyan-600/10" :
                              selectedSubject.id === "history" ? "bg-amber-600 shadow-amber-600/10" :
                              "bg-rose-600 shadow-rose-600/10"
                            }`}
                          >
                            Submit Answer
                          </button>
                        ) : (
                          <button
                            onClick={handleNextQuizQuestion}
                            className={`flex-1 py-4 rounded-xl text-sm font-bold text-white shadow-lg transition-all hover:scale-[1.01] ${
                              selectedSubject.id === "math" ? "bg-violet-600 shadow-violet-600/10" :
                              selectedSubject.id === "science" ? "bg-cyan-600 shadow-cyan-600/10" :
                              selectedSubject.id === "history" ? "bg-amber-600 shadow-amber-600/10" :
                              "bg-rose-600 shadow-rose-600/10"
                            }`}
                          >
                            {quizDifficulty > activeQuestion.level ? "Next Challenge (Level Up! 🚀)" :
                             quizDifficulty < activeQuestion.level ? "Next Challenge (Level Adjusted Down 📉)" :
                             "Next Challenge ➡️"}
                          </button>
                        )}
                      </div>
                    </>
                  )}

                </div>

              </motion.div>
            )}

            {/* COURSES TAB (GOOGLE CLASSROOM STYLE) */}
            {activeTab === "courses" && (
              <motion.div
                key="courses-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full overflow-y-auto p-6 md:p-8 bg-[#0a0a0f]/20 space-y-6"
              >
                {!selectedCourseForBoard ? (
                  <>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="space-y-1">
                        <h2 className="text-xl font-bold text-white">Student Course Board</h2>
                        <p className="text-xs text-muted-foreground">Select an enrolled classroom to review study materials and launch dynamic custom quizzes.</p>
                      </div>

                      {/* Instructor Selection Card */}
                      <div className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col md:flex-row items-start md:items-center gap-4 bg-gradient-to-r from-secondary/5 to-transparent w-full md:w-auto shrink-0">
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Course Instructor</span>
                          <div className="text-xs font-bold text-white mt-1">
                            {instructorId ? `🎓 ${instructorName}` : "❌ No Instructor Selected"}
                          </div>
                        </div>
                        <select
                          value={instructorId}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const teacher = availableTeachers.find(t => t.uid === selectedId);
                            if (teacher) {
                              handleSelectInstructor(teacher.uid, teacher.name);
                            } else {
                              handleSelectInstructor("", "");
                            }
                          }}
                          className="text-[11px] font-bold glass-input rounded-lg px-2.5 py-2 focus:outline-none bg-[#0e0e15] text-zinc-300 hover:text-white transition-all cursor-pointer"
                        >
                          <option value="">Choose Instructor</option>
                          {availableTeachers.map((t) => (
                            <option key={t.uid} value={t.uid}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {subjectsList.length === 0 ? (
                      <div className="glass-panel border border-dashed border-white/10 rounded-3xl p-12 text-center max-w-2xl mx-auto my-12 space-y-6 animate-fade-in">
                        <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-4xl mx-auto">
                          📚
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-lg font-bold text-white">No Enrolled Courses</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
                            Welcome to AetherAI! You are not currently enrolled in any classroom courses. Please use the enrollment link sent by your teacher to enroll in a course.
                          </p>
                        </div>
                        <div className="border-t border-white/5 pt-6 text-xs text-muted-foreground italic">
                          If you are testing as a guest, you can also select an instructor from the dropdown above to view their standard courses.
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        {subjectsList.map((sub) => {
                          const materials = courseMaterials[sub.id] || [];
                          const activeCount = materials.filter(m => m.isActive).length;
                          
                          let headerBg = "from-violet-600/20 to-violet-950/20 border-violet-500/20 shadow-violet-500/5";
                          let btnStyle = "bg-violet-600 hover:bg-violet-500 shadow-violet-600/20 text-white";
                          if (sub.themeColor === "science" || sub.themeColor === "cyan") {
                            headerBg = "from-cyan-600/20 to-cyan-950/20 border-cyan-500/20 shadow-cyan-500/5";
                            btnStyle = "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20 text-white";
                          } else if (sub.themeColor === "history" || sub.themeColor === "amber") {
                            headerBg = "from-amber-600/20 to-amber-950/20 border-amber-500/20 shadow-amber-500/5";
                            btnStyle = "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20 text-white";
                          } else if (sub.themeColor === "english" || sub.themeColor === "rose") {
                            headerBg = "from-rose-600/20 to-rose-950/20 border-rose-500/20 shadow-rose-500/5";
                            btnStyle = "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 text-white";
                          } else if (sub.themeColor === "emerald" || sub.themeColor === "green") {
                            headerBg = "from-emerald-600/20 to-emerald-950/20 border-emerald-500/20 shadow-emerald-500/5";
                            btnStyle = "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20 text-white";
                          } else if (sub.themeColor === "blue" || sub.themeColor === "indigo") {
                            headerBg = "from-blue-600/20 to-blue-950/20 border-blue-500/20 shadow-blue-500/5";
                            btnStyle = "bg-blue-600 hover:bg-blue-500 shadow-blue-600/20 text-white";
                          }

                          return (
                            <div 
                              key={sub.id} 
                              className={`glass-panel border rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl bg-gradient-to-b ${headerBg}`}
                            >
                              <div className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="text-3xl">{sub.personas[0].avatar}</span>
                                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground font-semibold">
                                    Enrolled
                                  </span>
                                </div>
                                
                                <div className="space-y-1.5">
                                  <h3 className="text-lg font-bold text-white">{sub.name}</h3>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    Learn and solve challenges guided by {sub.personas.map(p => p.name).join(" & ")}.
                                  </p>
                                </div>

                                <div className="flex items-center gap-4 text-xs font-semibold text-zinc-300 pt-2">
                                  <div className="flex items-center gap-1.5">
                                    <span>📁</span>
                                    <span>{materials.length} Materials</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={activeCount > 0 ? "text-emerald-400" : "text-muted-foreground"}>●</span>
                                    <span>{activeCount} RAG Active</span>
                                  </div>
                                </div>
                              </div>

                              <div className="p-5 border-t border-white/5 bg-[#0a0a0f]/40 flex justify-end">
                                <button
                                  onClick={() => setSelectedCourseForBoard(sub)}
                                  className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md ${btnStyle}`}
                                >
                                  Open Classroom Board →
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Platform Features Section */}
                    <div className="border-t border-white/5 pt-8 space-y-6">
                      <div>
                        <h3 className="text-base font-bold text-white uppercase tracking-wider">Platform Features</h3>
                        <p className="text-xs text-muted-foreground mt-1">Explore the core capabilities built into your Aether AI workspace.</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                          {
                            title: "Adaptive Practice Quizzes",
                            desc: "Practice with custom questions tailored to specific course modules. Difficulty adjusts dynamically in real-time.",
                            icon: "📝",
                            badge: "Interactive"
                          },
                          {
                            title: "Syllabus Vector RAG",
                            desc: "Activate context-aware study aids. Ground your AI quizzes and conceptual hints directly in uploaded PDFs and text docs.",
                            icon: "🧬",
                            badge: "AI Powered"
                          },
                          {
                            title: "Academic Standing metrics",
                            desc: "Monitor your Class Standing Percentage and track progress as you master advanced levels.",
                            icon: "📈",
                            badge: "Real-time"
                          },
                          {
                            title: "Classroom Grade Sync",
                            desc: "Connect seamlessly with verified course instructors to automatically log your quiz performance.",
                            icon: "🎓",
                            badge: "Seamless"
                          }
                        ].map((feat, i) => (
                          <div key={i} className="glass-panel p-5 rounded-2xl border border-white/5 bg-[#0a0a0f]/40 flex flex-col justify-between hover:border-white/10 hover:bg-[#12121c]/40 transition-all duration-300">
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-2xl">{feat.icon}</span>
                                <span className="text-[8px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                  {feat.badge}
                                </span>
                              </div>
                              <h4 className="text-xs font-bold text-white">{feat.title}</h4>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">{feat.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  // Course detail classroom board
                  <div className="space-y-6">
                    {/* Back header */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          setSelectedCourseForBoard(null);
                          setSelectedMaterialForPreview(null);
                        }}
                        className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-white transition-colors"
                      >
                        ← Back to Classrooms
                      </button>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Classroom: {selectedCourseForBoard.name}
                      </span>
                    </div>

                    {/* Course Banner */}
                    <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r ${
                      selectedCourseForBoard.themeColor === "math" || selectedCourseForBoard.themeColor === "violet" ? "from-violet-600/10 to-violet-950/20 border-violet-500/20" :
                      selectedCourseForBoard.themeColor === "science" || selectedCourseForBoard.themeColor === "cyan" ? "from-cyan-600/10 to-cyan-950/20 border-cyan-500/20" :
                      selectedCourseForBoard.themeColor === "history" || selectedCourseForBoard.themeColor === "amber" ? "from-amber-600/10 to-amber-950/20 border-amber-500/20" :
                      selectedCourseForBoard.themeColor === "english" || selectedCourseForBoard.themeColor === "rose" ? "from-rose-600/10 to-rose-950/20 border-rose-500/20" :
                      selectedCourseForBoard.themeColor === "emerald" || selectedCourseForBoard.themeColor === "green" ? "from-emerald-600/10 to-emerald-950/20 border-emerald-500/20" :
                      "from-blue-600/10 to-blue-950/20 border-blue-500/20"
                    }`}>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-white">{selectedCourseForBoard.name} Portal</h2>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                          Access textbook excerpts, syllabus notes, and slide text uploaded by your instructor. Selecting a material activates the Socratic RAG pipeline.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl p-3">
                        <span className="text-2xl">{selectedCourseForBoard.personas[0].avatar}</span>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Lead Instructor</div>
                          <div className="text-xs font-bold text-zinc-100">{selectedCourseForBoard.personas[0].name}</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      
                      {/* Left: Materials list */}
                      <div className="lg:col-span-7 space-y-4">
                        <h3 className="text-sm font-bold text-white tracking-wide uppercase">Course Materials</h3>
                        
                        {(courseMaterials[selectedCourseForBoard.id] || []).length === 0 ? (
                          <div className="glass-panel p-8 rounded-2xl border border-white/5 text-center text-xs text-muted-foreground">
                            No study materials uploaded for this classroom yet. Instructors can upload files in the Teacher Hub.
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {/* 1. Custom modules */}
                            {(selectedCourseForBoard.modules || []).map((mod) => {
                              const moduleFiles = (courseMaterials[selectedCourseForBoard.id] || []).filter(m => m.moduleId === mod.id);
                              if (moduleFiles.length === 0) return null;

                              let themeBtn = "bg-violet-600/15 hover:bg-violet-600 text-violet-400 hover:text-white border-violet-500/20";
                              if (selectedCourseForBoard.id === "science") themeBtn = "bg-cyan-600/15 hover:bg-cyan-600 text-cyan-400 hover:text-white border-cyan-500/20";
                              else if (selectedCourseForBoard.id === "history") themeBtn = "bg-amber-600/15 hover:bg-amber-600 text-amber-400 hover:text-white border-amber-500/20";
                              else if (selectedCourseForBoard.id === "english") themeBtn = "bg-rose-600/15 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-500/20";

                              return (
                                <div key={mod.id} className="space-y-3">
                                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                    <div className="space-y-0.5">
                                      <h4 className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide">
                                        <span>📦</span> {mod.name}
                                      </h4>
                                      {mod.description && (
                                        <p className="text-[10px] text-muted-foreground leading-none">{mod.description}</p>
                                      )}
                                    </div>
                                    
                                    <button
                                      onClick={() => {
                                        // Activate all files inside this module for this subject
                                        setCourseMaterials((prev) => {
                                          const subjectFiles = prev[selectedCourseForBoard.id] || [];
                                          const updatedFiles = subjectFiles.map(f => ({
                                            ...f,
                                            isActive: f.moduleId === mod.id
                                          }));
                                          return {
                                            ...prev,
                                            [selectedCourseForBoard.id]: updatedFiles
                                          };
                                        });

                                        setSelectedSubject(selectedCourseForBoard);
                                        setSelectedPersona(selectedCourseForBoard.personas[0]);
                                        setSelectedModuleForPractice(mod.id);
                                        setActiveTab("quiz");
                                        setQuizDifficulty(1);
                                        fetchNewQuestion(selectedCourseForBoard.id, 1, undefined, mod.id);
                                      }}
                                      className={`px-2.5 py-1 rounded text-[9px] font-bold border transition-colors ${themeBtn}`}
                                    >
                                      ⚡ Practice Module Quiz
                                    </button>
                                  </div>

                                  <div className="space-y-2">
                                    {moduleFiles.map((mat) => {
                                      const isSelectedForPreview = selectedMaterialForPreview?.id === mat.id;
                                      return (
                                        <div 
                                          key={mat.id}
                                          className={`glass-panel p-4 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4 ${
                                            isSelectedForPreview ? "border-primary bg-primary/5" : "border-white/5 hover:border-white/10 bg-[#07070a]/40"
                                          }`}
                                        >
                                          <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
                                              {mat.type === "pdf" ? "📄" : mat.type === "image" ? "🖼️" : "📝"}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <h4 className="text-xs font-bold text-white truncate flex items-center gap-1.5 flex-wrap">
                                                <span>{mat.title}</span>
                                                {mat.isChroma === undefined ? (
                                                  <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold uppercase tracking-wider">
                                                    System Core
                                                  </span>
                                                ) : mat.isChroma ? (
                                                  <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
                                                    Chroma DB
                                                  </span>
                                                ) : (
                                                  <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">
                                                    Local Cache
                                                  </span>
                                                )}
                                              </h4>
                                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                                Uploaded: {mat.uploadedAt} • Size: {mat.fileSize}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <button
                                              onClick={() => setSelectedMaterialForPreview(mat)}
                                              className="px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-[10px] font-bold text-zinc-200 transition-colors"
                                            >
                                              Preview File
                                            </button>
                                            <button
                                              onClick={() => {
                                                // Make ONLY this file active for this subject
                                                setCourseMaterials((prev) => {
                                                  const subjectFiles = prev[selectedCourseForBoard.id] || [];
                                                  const updatedFiles = subjectFiles.map(f => ({
                                                    ...f,
                                                    isActive: f.id === mat.id
                                                  }));
                                                  return {
                                                    ...prev,
                                                    [selectedCourseForBoard.id]: updatedFiles
                                                  };
                                                });
                                                setSelectedSubject(selectedCourseForBoard);
                                                setSelectedPersona(selectedCourseForBoard.personas[0]);
                                                setSelectedModuleForPractice(mod.id);
                                                setActiveTab("quiz");
                                                setQuizDifficulty(1);
                                                fetchNewQuestion(selectedCourseForBoard.id, 1, undefined, mod.id);
                                              }}
                                              className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${themeBtn}`}
                                            >
                                              📝 Start Quiz
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}

                            {/* 2. Unassigned / General Files */}
                            {(() => {
                              const generalFiles = (courseMaterials[selectedCourseForBoard.id] || []).filter(
                                m => !m.moduleId || !(selectedCourseForBoard.modules || []).some(mod => mod.id === m.moduleId)
                              );
                              if (generalFiles.length === 0) return null;

                              let themeBtn = "bg-violet-600/15 hover:bg-violet-600 text-violet-400 hover:text-white border-violet-500/20";
                              if (selectedCourseForBoard.id === "science") themeBtn = "bg-cyan-600/15 hover:bg-cyan-600 text-cyan-400 hover:text-white border-cyan-500/20";
                              else if (selectedCourseForBoard.id === "history") themeBtn = "bg-amber-600/15 hover:bg-amber-600 text-amber-400 hover:text-white border-amber-500/20";
                              else if (selectedCourseForBoard.id === "english") themeBtn = "bg-rose-600/15 hover:bg-rose-600 text-rose-400 hover:text-white border-rose-500/20";

                              return (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                    <h4 className="text-xs font-bold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wide">
                                      <span>📂</span> Core Syllabus / General
                                    </h4>
                                  </div>

                                  <div className="space-y-2">
                                    {generalFiles.map((mat) => {
                                      const isSelectedForPreview = selectedMaterialForPreview?.id === mat.id;
                                      return (
                                        <div 
                                          key={mat.id}
                                          className={`glass-panel p-4 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4 ${
                                            isSelectedForPreview ? "border-primary bg-primary/5" : "border-white/5 hover:border-white/10 bg-[#07070a]/40"
                                          }`}
                                        >
                                          <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-lg shrink-0">
                                              {mat.type === "pdf" ? "📄" : mat.type === "image" ? "🖼️" : "📝"}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <h4 className="text-xs font-bold text-white truncate flex items-center gap-1.5 flex-wrap">
                                                <span>{mat.title}</span>
                                                {mat.isChroma === undefined ? (
                                                  <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold uppercase tracking-wider">
                                                    System Core
                                                  </span>
                                                ) : mat.isChroma ? (
                                                  <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
                                                    Chroma DB
                                                  </span>
                                                ) : (
                                                  <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">
                                                    Local Cache
                                                  </span>
                                                )}
                                              </h4>
                                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                                Uploaded: {mat.uploadedAt} • Size: {mat.fileSize}
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2 shrink-0">
                                            <button
                                              onClick={() => setSelectedMaterialForPreview(mat)}
                                              className="px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 text-[10px] font-bold text-zinc-200 transition-colors"
                                            >
                                              Preview File
                                            </button>
                                            <button
                                              onClick={() => {
                                                // Make ONLY this file active for this subject
                                                setCourseMaterials((prev) => {
                                                  const subjectFiles = prev[selectedCourseForBoard.id] || [];
                                                  const updatedFiles = subjectFiles.map(f => ({
                                                    ...f,
                                                    isActive: f.id === mat.id
                                                  }));
                                                  return {
                                                    ...prev,
                                                    [selectedCourseForBoard.id]: updatedFiles
                                                  };
                                                });
                                                setSelectedSubject(selectedCourseForBoard);
                                                setSelectedPersona(selectedCourseForBoard.personas[0]);
                                                setSelectedModuleForPractice(null);
                                                setActiveTab("quiz");
                                                setQuizDifficulty(1);
                                                fetchNewQuestion(selectedCourseForBoard.id, 1);
                                              }}
                                              className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${themeBtn}`}
                                            >
                                              📝 Start Quiz
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Right: Preview Panel / OCR details */}
                      <div className="lg:col-span-5 space-y-4">
                        <h3 className="text-sm font-bold text-white tracking-wide uppercase">Document OCR Reader</h3>
                        
                        {!selectedMaterialForPreview ? (
                          <div className="glass-panel p-8 rounded-2xl border border-white/5 text-center text-xs text-muted-foreground bg-[#07070a]/20">
                            Select a course material to view its scanned text content and metadata index.
                          </div>
                        ) : (
                          <div className="glass-panel p-5 rounded-2xl border border-white/10 bg-[#0e0e16]/60 space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-white/5">
                              <div>
                                <h4 className="text-xs font-bold text-white leading-none">{selectedMaterialForPreview.title}</h4>
                                <span className="text-[9px] text-muted-foreground mt-1 block">OCR Scanner Index</span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 uppercase">
                                Scanned
                              </span>
                            </div>

                            <div className="space-y-1">
                              <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block">Extracted Text Chunk</span>
                              <div className="text-xs text-zinc-300 leading-relaxed bg-white/2 rounded-xl p-3.5 border border-white/5 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">
                                {selectedMaterialForPreview.content}
                              </div>
                            </div>

                            <div className="pt-2 flex items-center justify-between text-[10px] font-bold text-muted-foreground border-t border-white/5">
                              <span>Format: {selectedMaterialForPreview.type.toUpperCase()}</span>
                              <div className="flex items-center gap-1.5">
                                <span className={selectedMaterialForPreview.isActive ? "text-emerald-400 animate-pulse" : "text-muted-foreground"}>●</span>
                                <span>{selectedMaterialForPreview.isActive ? "Active in RAG" : "Inactive in RAG"}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* PROGRESS TAB */}
            {activeTab === "progress" && (
              <motion.div
                key="progress-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full overflow-y-auto p-6 md:p-8 space-y-8 bg-[#0a0a0f]/20"
              >
                
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {[
                    { label: "Adaptive GMAT Standing", value: `${gmatScore}`, icon: "📊", color: "from-blue-500/20 to-indigo-500/5", border: "border-blue-500/20" },
                    { label: "Study Streak", value: `${streak} Days`, icon: "🔥", color: "from-orange-500/20 to-red-500/5", border: "border-orange-500/20" },
                    { label: "Total Study Time", value: "12 Hours", icon: "⏳", color: "from-cyan-500/20 to-blue-500/5", border: "border-cyan-500/20" }
                  ].map((s, idx) => (
                    <div key={idx} className={`glass-panel p-5 rounded-2xl border ${s.border} bg-gradient-to-br ${s.color} flex items-center justify-between`}>
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
                        <h4 className="text-2xl font-bold text-white">{s.value}</h4>
                      </div>
                      <span className="text-3xl">{s.icon}</span>
                    </div>
                  ))}
                </div>

                {/* Achievements section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white">Unlocked Badges</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {badges.map((b, idx) => (
                      <div 
                        key={idx} 
                        className={`glass-panel p-5 rounded-2xl border flex items-center gap-5 transition-all duration-300 ${
                          b.unlocked 
                            ? "border-emerald-500/20 bg-emerald-950/5" 
                            : "border-white/5 bg-white/2 opacity-50"
                        }`}
                      >
                        <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl shrink-0">
                          {b.icon}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-white">{b.name}</h4>
                            {b.unlocked ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                                Unlocked
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground font-semibold border border-white/5">
                                Locked
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{b.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subject Mastery Charts */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white">Subject Mastery</h3>
                  <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
                    {[
                      { subject: "Mathematics", percentage: Math.min(100, Math.floor((gmatScore / 800) * 100)), color: "bg-violet-600" },
                      { subject: "Natural Sciences", percentage: 54, color: "bg-cyan-600" },
                      { subject: "World History", percentage: 90, color: "bg-amber-600" },
                      { subject: "English Literature", percentage: 38, color: "bg-rose-600" }
                    ].map((sm, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-white">{sm.subject}</span>
                          <span className="text-muted-foreground">{sm.percentage}% Mastered</span>
                        </div>
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full ${sm.color}`} style={{ width: `${sm.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </motion.div>
            )}

            {/* GRADEBOOK / ROSTER TAB */}
            {activeTab === "gradebook" && (() => {
              const filteredRoster = studentsRoster.filter((student) => {
                if (rosterSubjectFilter === "all") return true;

                const filterSubject = subjectsList.find((s) => s.id === rosterSubjectFilter);
                if (!filterSubject) return true;

                const studentCourse = student.enrolledCourse.toLowerCase();
                const filterName = filterSubject.name.toLowerCase();

                if (filterSubject.id === "science" && studentCourse.includes("science")) return true;
                if (filterSubject.id === "english" && studentCourse.includes("english")) return true;
                if (filterSubject.id === "english" && studentCourse.includes("lit")) return true;

                return studentCourse === filterName || studentCourse.includes(filterName);
              });

              return (
                <motion.div
                  key="gradebook-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="h-full overflow-y-auto p-6 md:p-8 space-y-8 bg-[#0a0a0f]/20"
                >
                  {/* Stats row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Active Enrolled Students</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-white">{filteredRoster.length}</span>
                        <span className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Now
                        </span>
                      </div>
                    </div>
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Class Average Mastery Score</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-primary">
                          {filteredRoster.length > 0 
                            ? Math.round(filteredRoster.reduce((sum, s) => sum + (s.gmatScore || 75), 0) / filteredRoster.length)
                            : 75}%
                        </span>
                        <span className="text-[10px] text-muted-foreground">out of 100</span>
                      </div>
                    </div>
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Socratic Hint Reliance</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-extrabold text-secondary">
                          {filteredRoster.length > 0
                            ? (filteredRoster.reduce((sum, s) => sum + s.hintsUsedCount, 0) / (filteredRoster.reduce((sum, s) => sum + s.totalQuestions, 0) || 1)).toFixed(1)
                            : "0.0"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Avg. hints per question</span>
                      </div>
                    </div>
                  </div>

                  {/* Students Roster table */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full justify-between">
                        <div>
                          <h2 className="text-xl font-bold text-white">Student Roster</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">Review performance levels, academic mastery grades, and cognitive effort metrics.</p>
                        </div>
                        
                        {/* Subject Filter Dropdown */}
                        <div className="flex items-center gap-2 bg-white/5 border border-white/5 p-1.5 rounded-xl shrink-0">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider px-2">Filter Course:</span>
                          <select
                            value={rosterSubjectFilter}
                            onChange={(e) => setRosterSubjectFilter(e.target.value)}
                            className="text-xs font-semibold glass-input rounded-lg px-2.5 py-1 bg-[#0e0e15] focus:outline-none text-zinc-300 hover:text-white cursor-pointer border border-white/10"
                          >
                            <option value="all">All Enrolled Courses</option>
                            {subjectsList.map((sub) => (
                              <option key={sub.id} value={sub.id}>
                                {sub.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Enroll Available Student Dropdown */}
                      {unenrolledStudents.length > 0 && (
                        <div className="flex items-center gap-2 bg-white/5 border border-white/5 p-2 rounded-xl shrink-0">
                          <select
                            id="enroll-student-select"
                            className="text-xs font-semibold glass-input rounded-lg px-2.5 py-1.5 bg-[#0e0e15] focus:outline-none text-zinc-300"
                          >
                            <option value="">Select Student to Enroll</option>
                            {unenrolledStudents.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              const selectEl = document.getElementById("enroll-student-select") as HTMLSelectElement;
                              if (selectEl && selectEl.value) {
                                handleEnrollStudent(selectEl.value);
                                selectEl.value = "";
                              } else {
                                alert("Please select a student from the list.");
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all"
                          >
                            Enroll Student
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                              <th className="px-6 py-4">Student</th>
                              <th className="px-6 py-4">Enrolled Course</th>
                              <th className="px-6 py-4 text-center">Adaptive Level</th>
                              <th className="px-6 py-4 text-center">Cognitive Effort</th>
                              <th className="px-6 py-4 text-center">Mastery Score</th>
                              <th className="px-6 py-4 text-right">Last Active</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-xs">
                            {filteredRoster.map((student) => (
                              <tr 
                                key={student.id}
                                onClick={() => setSelectedStudentForDetail(student)}
                                className="hover:bg-white/2 cursor-pointer transition-colors group"
                              >
                                <td className="px-6 py-4 flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg group-hover:scale-105 transition-transform">
                                    {student.avatar}
                                  </div>
                                  <div>
                                    <div className="font-bold text-white group-hover:text-primary transition-colors">{student.name}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">{student.email}</div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 font-semibold text-zinc-300">
                                  {student.enrolledCourse}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    student.adaptiveLevel === 1 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/10" :
                                    student.adaptiveLevel === 2 ? "bg-amber-500/10 text-amber-400 border-amber-500/10" :
                                    "bg-rose-500/10 text-rose-400 border-rose-500/10"
                                  }`}>
                                    Level {student.adaptiveLevel}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <div className="flex flex-col items-center gap-1.5">
                                    <span className={`font-bold ${
                                      student.cognitiveEffort >= 85 ? "text-emerald-400" :
                                      student.cognitiveEffort >= 60 ? "text-amber-400" : "text-rose-400"
                                    }`}>
                                      {student.cognitiveEffort}%
                                    </span>
                                    <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full ${
                                          student.cognitiveEffort >= 85 ? "bg-emerald-500" :
                                          student.cognitiveEffort >= 60 ? "bg-amber-500" : "bg-rose-500"
                                        }`}
                                        style={{ width: `${student.cognitiveEffort}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-center font-extrabold text-white">
                                  {student.gmatScore}%
                                </td>
                                <td className="px-6 py-4 text-right text-muted-foreground font-medium">
                                  {student.lastActive}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  {/* Performance Detail Overlay Modal */}
                  {selectedStudentForDetail && (
                    <div className="fixed inset-0 bg-[#07070a]/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-2xl glass-panel border border-white/10 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
                      >
                        <button
                          onClick={() => setSelectedStudentForDetail(null)}
                          className="absolute top-5 right-5 text-muted-foreground hover:text-white text-lg p-2"
                        >
                          ✕
                        </button>

                        {/* Student Profile Header */}
                        <div className="flex items-center gap-4">
                          <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl">
                            {selectedStudentForDetail.avatar}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white">{selectedStudentForDetail.name}</h3>
                            <p className="text-sm text-muted-foreground mt-0.5">{selectedStudentForDetail.email}</p>
                            <span className="text-[10px] uppercase font-bold text-primary tracking-wider mt-1.5 block">
                              Enrolled: {selectedStudentForDetail.enrolledCourse}
                            </span>
                          </div>
                        </div>

                        {/* Summary statistics grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                          <div className="bg-white/2 border border-white/5 rounded-2xl p-4 text-center">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block">Mastery Score</span>
                            <span className="text-xl font-extrabold text-white mt-1 block">{selectedStudentForDetail.gmatScore}%</span>
                          </div>
                          <div className="bg-white/2 border border-white/5 rounded-2xl p-4 text-center">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block">Questions</span>
                            <span className="text-xl font-extrabold text-white mt-1 block">{selectedStudentForDetail.totalQuestions}</span>
                          </div>
                          <div className="bg-white/2 border border-white/5 rounded-2xl p-4 text-center">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block">Correct Rate</span>
                            <span className="text-xl font-extrabold text-emerald-400 mt-1 block">
                              {selectedStudentForDetail.totalQuestions > 0 
                                ? Math.round((selectedStudentForDetail.correctAnswers / selectedStudentForDetail.totalQuestions) * 100)
                                : 0}%
                            </span>
                          </div>
                          <div className="bg-white/2 border border-white/5 rounded-2xl p-4 text-center">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block">Hints Used</span>
                            <span className="text-xl font-extrabold text-secondary mt-1 block">{selectedStudentForDetail.hintsUsedCount}</span>
                          </div>
                        </div>

                        {/* Recent Quiz Logs */}
                        <div className="space-y-4 pt-2">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Recent Quiz Activity Logs</h4>
                          {selectedStudentForDetail.recentActivity.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No quiz activity logs logged for this student yet.</p>
                          ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                              {selectedStudentForDetail.recentActivity.map((act, index) => (
                                <div 
                                  key={index}
                                  className={`p-4 rounded-2xl border bg-[#0a0a0f]/60 space-y-2.5 ${
                                    act.isCorrect 
                                      ? "border-emerald-500/10" 
                                      : "border-rose-500/10"
                                  }`}
                                >
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="text-xs text-white font-medium leading-relaxed">{act.questionText}</div>
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${
                                      act.isCorrect 
                                        ? "bg-emerald-500/10 text-emerald-400" 
                                        : "bg-rose-500/10 text-rose-400"
                                    }`}>
                                      {act.isCorrect ? "Correct" : "Incorrect"}
                                    </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-muted-foreground border-t border-white/5 pt-2">
                                    <div>
                                      <span className="font-semibold text-zinc-400">Student Answer:</span> {act.userAnswer}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-zinc-400">Correct Answer:</span> {act.correctAnswer}
                                    </div>
                                  </div>
                                  <div className="flex justify-between items-center text-[9px] text-muted-foreground pt-1.5 border-t border-white/5 border-dashed">
                                    <span>Level {act.level} • {act.hintsRequested} Hints Requested</span>
                                    <span>{act.timestamp}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </div>
                  )}
                </motion.div>
              );
            })()}

            {/* TEACHER HUB (RAG CONTROL) TAB */}
            {activeTab === "teacher" && (
              <motion.div
                key="teacher-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full overflow-y-auto p-6 md:p-8 space-y-8 bg-[#0a0a0f]/20"
              >
                {teacherSelectedCourseId === null ? (
                  // Course Directory Grid View
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-white">Course Management Directory</h2>
                      <p className="text-xs text-muted-foreground">Select a course classroom to manage documents, customize assignments, or delete custom courses.</p>
                    </div>

                    {subjectsList.length === 0 && (
                      <div className="p-6 rounded-2xl border border-dashed border-white/10 bg-white/2 text-center max-w-xl mx-auto my-6 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          💡 You haven't created any courses yet. Click <strong>Create New Course</strong> below to set up your first classroom and start inviting students!
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                      {subjectsList.map((sub) => {
                        const materials = courseMaterials[sub.id] || [];
                        const activeCount = materials.filter(m => m.isActive).length;
                        const isCustom = !["math", "science", "history", "english"].includes(sub.id);

                        let headerBg = "from-violet-600/10 to-violet-950/20 border-violet-500/20 shadow-violet-500/5";
                        let btnStyle = "bg-violet-600 hover:bg-violet-500 shadow-violet-600/20 text-white";
                        if (sub.themeColor === "science" || sub.themeColor === "cyan") {
                          headerBg = "from-cyan-600/10 to-cyan-950/20 border-cyan-500/20 shadow-cyan-500/5";
                          btnStyle = "bg-cyan-600 hover:bg-cyan-500 shadow-cyan-600/20 text-white";
                        } else if (sub.themeColor === "history" || sub.themeColor === "amber") {
                          headerBg = "from-amber-600/10 to-amber-950/20 border-amber-500/20 shadow-amber-500/5";
                          btnStyle = "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20 text-white";
                        } else if (sub.themeColor === "english" || sub.themeColor === "rose") {
                          headerBg = "from-rose-600/10 to-rose-950/20 border-rose-500/20 shadow-rose-500/5";
                          btnStyle = "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 text-white";
                        } else if (sub.themeColor === "emerald" || sub.themeColor === "green") {
                          headerBg = "from-emerald-600/10 to-emerald-950/20 border-emerald-500/20 shadow-emerald-500/5";
                          btnStyle = "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20 text-white";
                        } else if (sub.themeColor === "blue" || sub.themeColor === "indigo") {
                          headerBg = "from-blue-600/10 to-blue-950/20 border-blue-500/20 shadow-blue-500/5";
                          btnStyle = "bg-blue-600 hover:bg-blue-500 shadow-blue-600/20 text-white";
                        }

                        const firstPersona = sub.personas[0] || { name: "Default Tutor", avatar: "🤖" };

                        return (
                          <div 
                            key={sub.id} 
                            className={`glass-panel border rounded-2xl overflow-hidden flex flex-col justify-between shadow-xl bg-gradient-to-b ${headerBg}`}
                          >
                            <div className="p-6 space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-3xl">{firstPersona.avatar}</span>
                                <div className="flex items-center gap-1.5">
                                  {isCustom && (
                                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/25 border border-primary/20 text-primary-foreground font-semibold">
                                      Custom
                                    </span>
                                  )}
                                  <span className="text-[9px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground font-semibold">
                                    {isCustom ? "Managed" : "System Core"}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="space-y-1.5">
                                <h3 className="text-lg font-bold text-white">{sub.name}</h3>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  Tutor: {firstPersona.name} ({firstPersona.role})
                                </p>
                              </div>

                              <div className="flex items-center gap-4 text-xs font-semibold text-zinc-300 pt-2 border-t border-white/5">
                                <div className="flex items-center gap-1.5">
                                  <span>📁</span>
                                  <span>{materials.length} Documents</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className={activeCount > 0 ? "text-emerald-400" : "text-muted-foreground"}>●</span>
                                  <span>{activeCount} RAG Active</span>
                                </div>
                              </div>
                            </div>

                            <div className="p-5 border-t border-white/5 bg-[#0a0a0f]/40 flex justify-between items-center gap-2">
                              {isCustom ? (
                                <button
                                  onClick={() => handleDeleteCourse(sub.id)}
                                  className="px-3 py-2 rounded-xl text-[11px] font-bold text-rose-400 border border-rose-500/20 hover:bg-rose-500/15 transition-all animate-fade-in"
                                >
                                  Delete
                                </button>
                              ) : (
                                <div />
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setInviteCourse(sub)}
                                  className="px-3 py-2 rounded-xl text-[11px] font-bold text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/15 transition-all"
                                >
                                  Invite
                                </button>
                                <button
                                  onClick={() => {
                                    setTeacherSelectedCourseId(sub.id);
                                    setUploadSubject(sub.id);
                                  }}
                                  className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all shadow-md ${btnStyle}`}
                                >
                                  Manage →
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add New Course Trigger Card */}
                      <button
                        onClick={() => setIsCreateCourseModalOpen(true)}
                        className="glass-panel border border-dashed border-white/10 rounded-2xl hover:border-primary/40 hover:bg-white/5 transition-all flex flex-col items-center justify-center p-8 text-center min-h-[220px] cursor-pointer group"
                      >
                        <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform mb-4">
                          ➕
                        </div>
                        <h4 className="text-sm font-bold text-white">Create New Course</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">Add a custom syllabus and tutor persona to the system.</p>
                      </button>
                    </div>
                  </div>
                ) : (
                  // Course Detail Manager View
                  (() => {
                    const currentCourse = subjectsList.find(s => s.id === teacherSelectedCourseId) || subjectsList[0];
                    const materialsList = courseMaterials[currentCourse.id] || [];
                    
                    return (
                      <div className="space-y-6">
                        {/* Header controls */}
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => {
                              setTeacherSelectedCourseId(null);
                              setIngestionStatus("");
                            }}
                            className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-white transition-colors"
                          >
                            ← Back to Course Directory
                          </button>
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Managing Course: {currentCourse.name}
                          </span>
                        </div>

                        {/* Course Banner */}
                        <div className={`p-6 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r ${
                          currentCourse.themeColor === "math" || currentCourse.themeColor === "violet" ? "from-violet-600/10 to-violet-950/20 border-violet-500/20" :
                          currentCourse.themeColor === "science" || currentCourse.themeColor === "cyan" ? "from-cyan-600/10 to-cyan-950/20 border-cyan-500/20" :
                          currentCourse.themeColor === "history" || currentCourse.themeColor === "amber" ? "from-amber-600/10 to-amber-950/20 border-amber-500/20" :
                          currentCourse.themeColor === "english" || currentCourse.themeColor === "rose" ? "from-rose-600/10 to-rose-950/20 border-rose-500/20" :
                          currentCourse.themeColor === "emerald" || currentCourse.themeColor === "green" ? "from-emerald-600/10 to-emerald-950/20 border-emerald-500/20" :
                          "from-blue-600/10 to-blue-950/20 border-blue-500/20"
                        }`}>
                          <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-white">{currentCourse.name}</h2>
                            <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                              Upload materials for {currentCourse.name} to train its Socratic tutor. RAG-active materials will instantly guide quiz and chat generation for this course.
                            </p>
                          </div>
                          <div className="flex items-center gap-3 bg-white/5 border border-white/5 rounded-xl p-3">
                            <span className="text-2xl">{(currentCourse.personas[0] || {}).avatar || "🤖"}</span>
                            <div>
                              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Tutor Persona</div>
                              <div className="text-xs font-bold text-zinc-100">{(currentCourse.personas[0] || {}).name || "Default"}</div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                          
                          {/* Syllabus Document Uploader */}
                          <div className="lg:col-span-7 space-y-6">
                            <div className="space-y-1">
                              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Upload New Document</h3>
                              <p className="text-[10px] text-muted-foreground">Add files specifically to this course repository.</p>
                            </div>

                            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-5">
                              {/* Configuration Selectors */}
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Document Format</label>
                                  <select
                                    value={uploadType}
                                    onChange={(e) => setUploadType(e.target.value as "pdf" | "image" | "notes")}
                                    className="w-full text-xs glass-input rounded-xl px-3.5 py-3 focus:outline-none bg-[#0a0a0f]"
                                  >
                                    <option value="pdf">Adobe PDF (.pdf)</option>
                                    <option value="image">Scanned Photo/Slide (.png/.jpg)</option>
                                    <option value="notes">Raw Text Document (.txt)</option>
                                  </select>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Target Module</label>
                                  <select
                                    value={uploadModuleId}
                                    onChange={(e) => setUploadModuleId(e.target.value)}
                                    className="w-full text-xs glass-input rounded-xl px-3.5 py-3 focus:outline-none bg-[#0a0a0f]"
                                  >
                                    <option value="">Core Syllabus (No Module)</option>
                                    {(currentCourse.modules || []).map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1.5 flex flex-col justify-end">
                                  <span className="text-[10px] text-muted-foreground font-semibold">Scoped to course:</span>
                                  <div className="text-xs font-bold text-white px-3.5 py-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-2">
                                    <span>{(currentCourse.personas[0] || {}).avatar || "🤖"}</span>
                                    <span>{currentCourse.name}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Functional File Dropzone Uploader */}
                              <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept=".pdf,.png,.jpg,.jpeg,.txt"
                              />

                              <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={handleDragOver}
                                onDrop={handleFileDrop}
                                className="border border-dashed border-white/10 rounded-2xl p-6 bg-[#07070a]/40 hover:bg-[#07070a]/60 hover:border-primary/40 transition-all text-center space-y-4 cursor-pointer group"
                              >
                                {selectedRawFile ? (
                                  <div className="space-y-2">
                                    <div className="text-3xl text-emerald-400 group-hover:scale-110 transition-transform">📄</div>
                                    <h4 className="text-xs font-bold text-white max-w-[250px] mx-auto truncate">
                                      {selectedRawFile.name}
                                    </h4>
                                    <p className="text-[10px] text-emerald-400 font-semibold">
                                      Size: {(selectedRawFile.size / 1024).toFixed(1)} KB | Ready to vector index
                                    </p>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedRawFile(null);
                                        setUploadTitle("");
                                        setUploadContent("");
                                        setIngestionStatus("");
                                      }}
                                      className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-[9px] font-bold text-rose-400 transition-colors"
                                    >
                                      Remove File
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="text-3xl group-hover:scale-110 transition-transform">📁</div>
                                    <h4 className="text-xs font-bold text-white">Drag & Drop Syllabus Document Here</h4>
                                    <p className="text-[10px] text-muted-foreground">Or click to browse files (PDF, PNG, JPG, TXT)</p>
                                  </div>
                                )}

                                {/* Quick Presets Row */}
                                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mr-1">Load Preset:</span>
                                  {currentCourse.id === "math" && (
                                    <button
                                      onClick={() => loadUploaderPreset("calculus")}
                                      className="px-2 py-1 rounded bg-violet-950/40 hover:bg-violet-900 border border-violet-500/20 text-[9px] font-bold text-violet-300 transition-colors"
                                    >
                                      📐 Calculus limits
                                    </button>
                                  )}
                                  {currentCourse.id === "science" && (
                                    <button
                                      onClick={() => loadUploaderPreset("photosynthesis")}
                                      className="px-2 py-1 rounded bg-cyan-950/40 hover:bg-cyan-900 border border-cyan-500/20 text-[9px] font-bold text-cyan-300 transition-colors"
                                    >
                                      🧪 Photosynthesis
                                    </button>
                                  )}
                                  {currentCourse.id === "history" && (
                                    <button
                                      onClick={() => loadUploaderPreset("magnacarta")}
                                      className="px-2 py-1 rounded bg-amber-950/40 hover:bg-amber-900 border border-amber-500/20 text-[9px] font-bold text-amber-300 transition-colors"
                                    >
                                      📜 Magna Carta
                                    </button>
                                  )}
                                  {currentCourse.id === "english" && (
                                    <button
                                      onClick={() => loadUploaderPreset("romeo")}
                                      className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900 border border-rose-500/20 text-[9px] font-bold text-rose-300 transition-colors"
                                    >
                                      🖋️ Romeo & Juliet
                                    </button>
                                  )}
                                  {!["math", "science", "history", "english"].includes(currentCourse.id) && (
                                    <button
                                      onClick={() => {
                                        setUploadTitle(`Intro_to_${currentCourse.name.replace(/\s+/g, "_")}.txt`);
                                        setUploadContent(`This is the core syllabus notes for the newly created course: ${currentCourse.name}.\n\nThe primary focus of this course is understanding fundamental principles, concepts, and structures.\n\nAI Socratic Tutor ${(currentCourse.personas[0] || {}).name} will help students explore: \n- Core terms\n- Basic equations and relationships\n- Practical applications in real-world scenarios.`);
                                      }}
                                      className="px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 border border-primary/30 text-[9px] font-bold text-white transition-colors"
                                    >
                                      ⚡ Auto-fill Syllabus Template
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* File details input */}
                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">File Name</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Lecture_Slides_Overview.pdf"
                                    value={uploadTitle}
                                    onChange={(e) => setUploadTitle(e.target.value)}
                                    className="w-full text-xs glass-input rounded-xl px-3.5 py-3 focus:outline-none"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Pasted OCR Text/Notes Content</label>
                                  <textarea
                                    rows={5}
                                    placeholder="Enter the textual content of the textbook excerpt or lesson sheet..."
                                    value={uploadContent}
                                    onChange={(e) => setUploadContent(e.target.value)}
                                    className="w-full text-xs glass-input rounded-xl p-4 focus:outline-none leading-relaxed font-mono"
                                  />
                                </div>
                              </div>

                              {/* Ingest Action Button */}
                              <button
                                onClick={handleUploadAndIngest}
                                disabled={isUploadingMock || !uploadTitle.trim() || !uploadContent.trim()}
                                className="w-full rounded-xl py-3.5 text-xs font-bold text-white bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all hover:scale-[1.01] disabled:opacity-40"
                              >
                                {isUploadingMock ? "Uploading & Vectorizing..." : "Ingest Syllabus Document & Update RAG index"}
                              </button>

                              {/* Live uploading progress indicator */}
                              {uploadProgress !== null && (
                                <div className="space-y-1.5 pt-1">
                                  <div className="flex justify-between text-[9px] font-bold text-zinc-300">
                                    <span>Indexing Chunk Nodes...</span>
                                    <span>{uploadProgress}%</span>
                                  </div>
                                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-200" 
                                      style={{ width: `${uploadProgress}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {ingestionStatus && (
                                <div className={`p-4 rounded-xl text-xs font-semibold border ${
                                  ingestionStatus.includes("Error") 
                                    ? "bg-red-500/15 text-red-400 border-red-500/25"
                                    : ingestionStatus.includes("successfully") || ingestionStatus.includes("active")
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                                    : "bg-white/5 text-zinc-300 border-white/5"
                                }`}>
                                  {ingestionStatus}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Uploaded Syllabus Manager */}
                          <div className="lg:col-span-5 space-y-6">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Active Classroom Index</h3>
                            
                            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                              {/* Active files list for RAG */}
                              <div className="space-y-3">
                                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Indexed Files</label>
                                
                                {materialsList.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic bg-white/2 rounded-xl p-4 border border-white/5 text-center">No documents uploaded for this subject yet.</p>
                                ) : (
                                  <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
                                    {/* 1. Loop through custom modules */}
                                    {(currentCourse.modules || []).map((mod) => {
                                      const moduleFiles = materialsList.filter((m) => m.moduleId === mod.id);
                                      if (moduleFiles.length === 0) return null;
                                      return (
                                        <div key={mod.id} className="space-y-1.5">
                                          <div className="text-[9px] font-bold text-primary uppercase tracking-wider px-1">
                                            📦 {mod.name}
                                          </div>
                                          <div className="space-y-2">
                                            {moduleFiles.map((mat) => (
                                              <div 
                                                key={mat.id}
                                                className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-[#0a0a0f]/60 gap-3"
                                              >
                                                <div className="min-w-0 flex-1">
                                                  <div className="text-[10px] font-bold text-white truncate flex items-center gap-1.5 flex-wrap">
                                                    <span>{mat.title}</span>
                                                    {mat.isChroma === undefined ? (
                                                      <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold uppercase tracking-wider">
                                                        System Core
                                                      </span>
                                                    ) : mat.isChroma ? (
                                                      <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
                                                        Chroma DB
                                                      </span>
                                                    ) : (
                                                      <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">
                                                        Local Cache
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-[9px] text-muted-foreground mt-0.5">{mat.fileSize} • {mat.uploadedAt}</div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                  {/* Toggle button */}
                                                  <button
                                                    onClick={() => handleToggleMaterialRAG(currentCourse.id, mat.id)}
                                                    className={`px-2 py-1 rounded text-[9px] font-bold border transition-colors ${
                                                      mat.isActive 
                                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                                        : "bg-white/5 text-muted-foreground border-white/5"
                                                    }`}
                                                  >
                                                    {mat.isActive ? "RAG On" : "RAG Off"}
                                                  </button>

                                                  {/* Delete button */}
                                                  <button
                                                    onClick={() => handleDeleteMaterial(currentCourse.id, mat.id)}
                                                    className="h-6 w-6 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-white flex items-center justify-center text-xs transition-colors"
                                                  >
                                                    🗑️
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {/* 2. Unassigned / General files */}
                                    {(() => {
                                      const generalFiles = materialsList.filter((m) => !m.moduleId || !(currentCourse.modules || []).some(mod => mod.id === m.moduleId));
                                      if (generalFiles.length === 0) return null;
                                      return (
                                        <div className="space-y-1.5">
                                          <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                                            📂 Core Syllabus / General
                                          </div>
                                          <div className="space-y-2">
                                            {generalFiles.map((mat) => (
                                              <div 
                                                key={mat.id}
                                                className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-[#0a0a0f]/60 gap-3"
                                              >
                                                <div className="min-w-0 flex-1">
                                                  <div className="text-[10px] font-bold text-white truncate flex items-center gap-1.5 flex-wrap">
                                                    <span>{mat.title}</span>
                                                    {mat.isChroma === undefined ? (
                                                      <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 font-bold uppercase tracking-wider">
                                                        System Core
                                                      </span>
                                                    ) : mat.isChroma ? (
                                                      <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider">
                                                        Chroma DB
                                                      </span>
                                                    ) : (
                                                      <span className="text-[7.5px] leading-none px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase tracking-wider">
                                                        Local Cache
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-[9px] text-muted-foreground mt-0.5">{mat.fileSize} • {mat.uploadedAt}</div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                  {/* Toggle button */}
                                                  <button
                                                    onClick={() => handleToggleMaterialRAG(currentCourse.id, mat.id)}
                                                    className={`px-2 py-1 rounded text-[9px] font-bold border transition-colors ${
                                                      mat.isActive 
                                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                                        : "bg-white/5 text-muted-foreground border-white/5"
                                                    }`}
                                                  >
                                                    {mat.isActive ? "RAG On" : "RAG Off"}
                                                  </button>

                                                  {/* Delete button */}
                                                  <button
                                                    onClick={() => handleDeleteMaterial(currentCourse.id, mat.id)}
                                                    className="h-6 w-6 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-white flex items-center justify-center text-xs transition-colors"
                                                  >
                                                    🗑️
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>

                              {/* Legacy Details Summary */}
                              <div className="pt-3 border-t border-white/5 space-y-3">
                                <div className="space-y-1">
                                  <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider leading-none">Last Vectorized Source</span>
                                  <div className="text-[10px] font-bold text-white leading-tight mt-1">{currentSourceMaterial}</div>
                                </div>
                                
                                <div className="space-y-2 pt-1 border-t border-[#0a0a0f] border-dashed">
                                  <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider leading-none block">Extracted Entities</span>
                                  <div className="flex flex-wrap gap-1">
                                    {extractedEntities.map((ent, idx) => (
                                      <span 
                                        key={idx} 
                                        className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-bold text-zinc-300"
                                      >
                                        {ent}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* RAG Status details */}
                              <div className="pt-3 border-t border-white/5 space-y-2 text-[10px] text-muted-foreground leading-relaxed">
                                <div className="flex items-center gap-1.5 font-bold uppercase text-white tracking-wide">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  RAG Vector Status
                                </div>
                                <p>
                                  Files marked with <strong>RAG On</strong> are read in the vector space context. Socratic AI will generate adaptive exam questions matching these specific files.
                                </p>
                              </div>
                            </div>

                            {/* Course Modules Widget */}
                            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <span>📦</span> Course Modules
                                </h4>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                  Add logical learning sections to organize files and scope practice quizzes.
                                </p>
                              </div>

                              {/* Modules List */}
                              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {(currentCourse.modules || []).length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic bg-white/2 rounded-xl p-3 border border-white/5 text-center">
                                    No custom modules created yet.
                                  </p>
                                ) : (
                                  (currentCourse.modules || []).map((mod) => {
                                    // Count files in this module
                                    const moduleFilesCount = materialsList.filter(m => m.moduleId === mod.id).length;
                                    return (
                                      <div key={mod.id} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-[#0a0a0f]/60 gap-3">
                                        <div className="min-w-0">
                                          <div className="text-[10px] font-bold text-white truncate">{mod.name}</div>
                                          {mod.description && (
                                            <div className="text-[9px] text-muted-foreground truncate mt-0.5">{mod.description}</div>
                                          )}
                                          <div className="text-[8px] text-primary font-semibold mt-0.5">
                                            {moduleFilesCount} {moduleFilesCount === 1 ? "document" : "documents"}
                                          </div>
                                        </div>
                                        {/* Remove module */}
                                        <button
                                          onClick={() => {
                                            setSubjectsList((prev) => {
                                              return prev.map((sub) => {
                                                if (sub.id === currentCourse.id) {
                                                  return {
                                                    ...sub,
                                                    modules: (sub.modules || []).filter(m => m.id !== mod.id)
                                                  };
                                                }
                                                return sub;
                                              });
                                            });
                                          }}
                                          className="h-5 w-5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-white flex items-center justify-center text-[10px] transition-colors"
                                          title="Delete Module"
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              {/* Add Module Inline Form */}
                              <div className="pt-2 border-t border-white/5 space-y-3">
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">New Module Name</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Derivative Chain Rule"
                                    value={newModuleName}
                                    onChange={(e) => setNewModuleName(e.target.value)}
                                    className="w-full text-xs glass-input rounded-xl px-3.5 py-2.5 focus:outline-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Description (Optional)</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. Master differentiation chain rule application"
                                    value={newModuleDesc}
                                    onChange={(e) => setNewModuleDesc(e.target.value)}
                                    className="w-full text-xs glass-input rounded-xl px-3.5 py-2.5 focus:outline-none"
                                  />
                                </div>
                                <button
                                  onClick={() => {
                                    if (!newModuleName.trim()) return;
                                    const newMod = {
                                      id: `module-${Date.now()}`,
                                      name: newModuleName.trim(),
                                      description: newModuleDesc.trim() || undefined
                                    };
                                    setSubjectsList((prev) => {
                                      return prev.map((sub) => {
                                        if (sub.id === currentCourse.id) {
                                          return {
                                            ...sub,
                                            modules: [...(sub.modules || []), newMod]
                                          };
                                        }
                                        return sub;
                                      });
                                    });
                                    setNewModuleName("");
                                    setNewModuleDesc("");
                                  }}
                                  disabled={!newModuleName.trim()}
                                  className="w-full rounded-xl py-2.5 text-xs font-bold text-white bg-primary hover:bg-primary/95 hover:shadow-lg transition-all disabled:opacity-40"
                                >
                                  + Create Module
                                </button>
                              </div>
                            </div>

                            {/* Assign Custom Quiz Card */}
                            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                                  <span>📝</span> Assign Custom Quiz Task
                                </h4>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                  Set a specific difficulty and topic focus for students. This alert will pin to their Practice Quiz desk.
                                </p>
                              </div>

                              <div className="space-y-3.5 pt-2">
                                {/* Scoped Target Course display */}
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Target Course</label>
                                  <div className="w-full text-xs font-bold text-white px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
                                    {currentCourse.name}
                                  </div>
                                </div>

                                {/* Level */}
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Difficulty Level</label>
                                  <select
                                    id="assign-level"
                                    className="w-full text-[11px] glass-input rounded-lg px-2.5 py-2 focus:outline-none bg-[#0e0e15]"
                                    defaultValue="2"
                                  >
                                    <option value="1">Level 1 - Basic Concepts</option>
                                    <option value="2">Level 2 - Core Formulas</option>
                                    <option value="3">Level 3 - Advanced Deductions</option>
                                  </select>
                                </div>

                                {/* Quiz Length Limit */}
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Quiz Length Limit</label>
                                  <select
                                    id="assign-max-questions"
                                    className="w-full text-[11px] glass-input rounded-lg px-2.5 py-2 focus:outline-none bg-[#0e0e15]"
                                    defaultValue="10"
                                  >
                                    <option value="10">10 Questions</option>
                                    <option value="20">20 Questions</option>
                                  </select>
                                </div>

                                {/* Topic Focus */}
                                <div className="space-y-1">
                                  <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Topic Focus Prompt</label>
                                  <input
                                    type="text"
                                    id="assign-focus"
                                    placeholder="e.g. Limits of trigonometric functions, ATP Synthesis..."
                                    className="w-full text-[11px] glass-input rounded-lg px-2.5 py-2 focus:outline-none"
                                  />
                                </div>

                                <button
                                  onClick={async () => {
                                    const lvlEl = document.getElementById("assign-level") as HTMLSelectElement;
                                    const focEl = document.getElementById("assign-focus") as HTMLInputElement;
                                    const maxQEl = document.getElementById("assign-max-questions") as HTMLSelectElement;
                                    if (lvlEl && focEl && maxQEl) {
                                      const levelNum = parseInt(lvlEl.value);
                                      const focusText = focEl.value.trim() || "General Syllabus Review";
                                      const maxQuestionsVal = parseInt(maxQEl.value);
                                      
                                      const assignment = {
                                        subject: currentCourse.id,
                                        level: levelNum,
                                        focus: focusText,
                                        maxQuestions: maxQuestionsVal,
                                        timestamp: new Date().toISOString()
                                      };

                                      if (isFirebaseEnabled && db && auth?.currentUser) {
                                        try {
                                          await updateDoc(doc(db, "users", auth.currentUser.uid), {
                                            activeAssignment: assignment
                                          });
                                        } catch (e) {
                                          console.error("Error pushing assignment to Firestore:", e);
                                        }
                                      } else {
                                        const mockUsersJSON = localStorage.getItem("aether_mock_users");
                                        if (mockUsersJSON) {
                                          let mockUsers = JSON.parse(mockUsersJSON);
                                          const teacherUid = localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily";
                                          mockUsers = mockUsers.map((u: any) => {
                                            if (u.uid === teacherUid) {
                                              return { ...u, activeAssignment: assignment };
                                            }
                                            return u;
                                          });
                                          localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
                                        }
                                      }

                                      setAssignedQuizTask(assignment);
                                      alert(`Successfully assigned custom ${maxQuestionsVal}-question quiz on: "${focusText}"!`);
                                      focEl.value = "";
                                    }
                                  }}
                                  className="w-full rounded-lg py-2.5 text-[10px] font-bold text-white bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all"
                                >
                                  Push Assignment to Students
                                </button>

                                {assignedQuizTask && assignedQuizTask.subject === currentCourse.id && (
                                  <div className="p-3 bg-white/5 border border-white/5 rounded-lg flex items-center justify-between text-[10px] gap-2">
                                    <div className="min-w-0">
                                      <div className="font-bold text-white truncate">Active: {assignedQuizTask.focus}</div>
                                      <div className="text-[9px] text-muted-foreground mt-0.5">{currentCourse.name} • Level {assignedQuizTask.level} ({assignedQuizTask.maxQuestions} Qs)</div>
                                    </div>
                                    <button
                                      onClick={async () => {
                                        if (isFirebaseEnabled && db && auth?.currentUser) {
                                          try {
                                            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                                              activeAssignment: null
                                            });
                                          } catch (e) {
                                            console.error("Error clearing assignment from Firestore:", e);
                                          }
                                        } else {
                                          const mockUsersJSON = localStorage.getItem("aether_mock_users");
                                          if (mockUsersJSON) {
                                            let mockUsers = JSON.parse(mockUsersJSON);
                                            const teacherUid = localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily";
                                            mockUsers = mockUsers.map((u: any) => {
                                              if (u.uid === teacherUid) {
                                                const { activeAssignment, ...rest } = u;
                                                return rest;
                                              }
                                              return u;
                                            });
                                            localStorage.setItem("aether_mock_users", JSON.stringify(mockUsers));
                                          }
                                        }
                                        setAssignedQuizTask(null);
                                      }}
                                      className="text-[9px] font-bold text-red-400 hover:text-red-300 shrink-0"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })()
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </main>

      {/* Floating Mobile Tabs bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0a0a0f]/95 border-t border-white/5 backdrop-blur-md flex items-center justify-around z-50">
        {userRole === "student" ? (
          <>
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                activeTab === "chat" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Chat
            </button>
            <button
              onClick={() => setActiveTab("quiz")}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                activeTab === "quiz" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Quiz
            </button>
            <button
              onClick={() => {
                setActiveTab("courses");
                setSelectedCourseForBoard(null);
                setSelectedMaterialForPreview(null);
              }}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                activeTab === "courses" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Courses
            </button>
            <button
              onClick={() => setActiveTab("progress")}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                activeTab === "progress" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10a2 2 0 01-2 2h-2a2 2 0 01-2-2zm9-1a1 1 0 011-1h1a1 1 0 011 1v3a1 1 0 01-1 1h-1a1 1 0 01-1-1v-3z" />
              </svg>
              Stats
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab("gradebook")}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                activeTab === "gradebook" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0-.001h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Roster
            </button>
            <button
              onClick={() => {
                setActiveTab("teacher");
                setTeacherSelectedCourseId(null);
              }}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                activeTab === "teacher" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
              </svg>
              Materials
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${
                activeTab === "chat" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Playground
            </button>
          </>
        )}
      </div>

      {/* Create New Course Modal */}
      {isCreateCourseModalOpen && (
        <div className="fixed inset-0 bg-[#07070a]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg glass-panel border border-white/10 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative"
          >
            <button
              onClick={() => setIsCreateCourseModalOpen(false)}
              className="absolute top-5 right-5 text-muted-foreground hover:text-white text-lg p-2 cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>🎓</span> Create New Classroom Course
              </h3>
              <p className="text-xs text-muted-foreground">Define your custom syllabus track and construct a specialized Socratic AI tutor persona.</p>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              
              {/* Course details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Course Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Introduction to Astronomy"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    className="w-full text-xs glass-input rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Theme Color Scheme</label>
                  <select
                    value={newCourseColor}
                    onChange={(e) => setNewCourseColor(e.target.value)}
                    className="w-full text-xs glass-input rounded-xl px-3 py-2.5 focus:outline-none bg-[#0a0a0f]"
                  >
                    <option value="violet">Violet Neon</option>
                    <option value="cyan">Electric Cyan</option>
                    <option value="amber">Sunset Amber</option>
                    <option value="rose">Rose Quartz</option>
                    <option value="emerald">Emerald Aurora</option>
                    <option value="blue">Royal Blue</option>
                  </select>
                </div>
              </div>

              {/* Tutor Persona */}
              <div className="space-y-4 pt-3 border-t border-white/5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Tutor Persona Configuration</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tutor Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Albert Einstein"
                      value={newTutorName}
                      onChange={(e) => setNewTutorName(e.target.value)}
                      className="w-full text-xs glass-input rounded-xl px-3 py-2.5 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Avatar Emoji</label>
                    <select
                      value={newTutorAvatar}
                      onChange={(e) => setNewTutorAvatar(e.target.value)}
                      className="w-full text-xs glass-input rounded-xl px-3 py-2.5 focus:outline-none bg-[#0a0a0f]"
                    >
                      <option value="🤖">🤖 Robot</option>
                      <option value="🪐">🪐 Planet</option>
                      <option value="🧪">🧪 Flask</option>
                      <option value="📜">📜 Scroll</option>
                      <option value="📐">📐 Ruler</option>
                      <option value="🖋️">🖋️ Pen</option>
                      <option value="💻">💻 Laptop</option>
                      <option value="🧬">🧬 DNA</option>
                      <option value="🎨">🎨 Palette</option>
                      <option value="🧠">🧠 Brain</option>
                      <option value="🧙‍♂️">🧙‍♂️ Wizard</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tutor Role/Style</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Astrophysics Reasoning Guide"
                    value={newTutorRole}
                    onChange={(e) => setNewTutorRole(e.target.value)}
                    className="w-full text-xs glass-input rounded-xl px-3 py-2.5 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tutor Intro Prompt</label>
                  <textarea
                    rows={3}
                    placeholder="Enter the welcome message the tutor gives when a student starts a chat..."
                    value={newTutorIntro}
                    onChange={(e) => setNewTutorIntro(e.target.value)}
                    className="w-full text-xs glass-input rounded-xl p-3 focus:outline-none leading-relaxed"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl py-3.5 text-xs font-bold text-white bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all hover:scale-[1.01] cursor-pointer"
              >
                Create Course & Initialize Tutor
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Invite Students Modal */}
      {inviteCourse && (
        <div className="fixed inset-0 bg-[#07070a]/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg glass-panel border border-white/10 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative"
          >
            <button
              onClick={() => {
                setInviteCourse(null);
                setIsCopied(false);
              }}
              className="absolute top-5 right-5 text-muted-foreground hover:text-white text-lg p-2 cursor-pointer"
            >
              ✕
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>✉️</span> Invite Students to {inviteCourse.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Share this link with your students. When they register or log in using this link, they will be automatically enrolled in this course.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Enrollment Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? `${window.location.origin}/login?enrollCourseId=${inviteCourse.id}&teacherId=${
                      isFirebaseEnabled && auth?.currentUser
                        ? auth.currentUser.uid
                        : (localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily")
                    }` : ""}
                    className="flex-1 text-xs glass-input rounded-xl px-3 py-2.5 focus:outline-none text-zinc-300 font-mono select-all bg-black/40 border border-white/5"
                  />
                  <button
                    onClick={() => {
                      const link = `${window.location.origin}/login?enrollCourseId=${inviteCourse.id}&teacherId=${
                        isFirebaseEnabled && auth?.currentUser
                          ? auth.currentUser.uid
                          : (localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily")
                      }`;
                      navigator.clipboard.writeText(link);
                      setIsCopied(true);
                      setTimeout(() => setIsCopied(false), 2000);
                    }}
                    className={`px-4 rounded-xl text-xs font-bold text-white transition-all whitespace-nowrap min-w-[80px] cursor-pointer ${
                      isCopied 
                        ? "bg-emerald-600 border border-emerald-500/30" 
                        : "bg-primary hover:bg-primary/90"
                    }`}
                  >
                    {isCopied ? "Copied! ✓" : "Copy Link"}
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">
                  Quick Share
                </p>
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    `Enroll in my course: ${inviteCourse.name} on AetherAI`
                  )}&body=${encodeURIComponent(
                    `Hello!\n\nYou have been invited to enroll in my course, "${inviteCourse.name}", on AetherAI.\n\nPlease click the link below to sign up/login and automatically enroll in this course:\n\n${
                      typeof window !== "undefined"
                        ? `${window.location.origin}/login?enrollCourseId=${inviteCourse.id}&teacherId=${
                            isFirebaseEnabled && auth?.currentUser
                              ? auth.currentUser.uid
                              : (localStorage.getItem("mock_current_user_uid") || "mock-teacher-emily")
                          }`
                        : ""
                    }\n\nBest regards,\n${currentUserName}`
                  )}`}
                  className="w-full rounded-xl py-3 text-xs font-bold text-center text-white border border-white/10 bg-white/5 hover:bg-white/10 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>✉️</span> Send Invitation Email
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
