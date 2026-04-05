/**
 * Dev fixtures for task submissions
 * These are used during development and testing when the API is not available
 */

import type { Submission } from '@/lib/hooks/mentor/useSubmissionReview';

export const submissionsFixtures: Submission[] = [
  {
    id: 1,
    mentee: 'Alex Thompson',
    menteeId: 'mentee-1',
    task: 'Build a React component library',
    taskId: 'task-1',
    program: 'Full Stack Development',
    submittedDate: '2024-02-18',
    hoursAgo: 4,
    priority: 'high',
    hasFiles: true,
    hasLinks: true,
    description: 'I built a comprehensive React component library with TypeScript, including Button, Input, Card, and Modal components. Each component is fully typed and includes Storybook documentation. I used Tailwind CSS for styling and followed atomic design principles.',
    links: ['https://github.com/alex/component-library', 'https://storybook.example.com'],
    files: ['component-lib.zip', 'screenshots.pdf'],
  },
  {
    id: 2,
    mentee: 'Maria Garcia',
    menteeId: 'mentee-2',
    task: 'Implement user authentication',
    taskId: 'task-2',
    program: 'Full Stack Development',
    submittedDate: '2024-02-17',
    hoursAgo: 24,
    priority: 'medium',
    hasFiles: false,
    hasLinks: true,
    description: 'Implemented JWT-based authentication with refresh tokens using Express and PostgreSQL. Added email verification, password reset, and session management. All routes are protected with middleware.',
    links: ['https://github.com/maria/auth-system'],
    files: [],
  },
  {
    id: 3,
    mentee: 'Maria Garcia',
    menteeId: 'mentee-2',
    task: 'Create REST API endpoints',
    taskId: 'task-3',
    program: 'Full Stack Development',
    submittedDate: '2024-02-17',
    hoursAgo: 26,
    priority: 'medium',
    hasFiles: true,
    hasLinks: true,
    description: 'Built CRUD operations for user management and products using Express.js. Implemented validation with Joi, error handling middleware, and API documentation with Swagger.',
    links: ['https://api.example.com/docs', 'https://github.com/maria/rest-api'],
    files: ['postman-collection.json'],
  },
  {
    id: 4,
    mentee: 'James Wilson',
    menteeId: 'mentee-3',
    task: 'Database design and schema',
    taskId: 'task-4',
    program: 'Full Stack Development',
    submittedDate: '2024-02-16',
    hoursAgo: 48,
    priority: 'low',
    hasFiles: true,
    hasLinks: false,
    description: 'Designed a normalized database schema for the e-commerce application with proper relationships, indexes, and constraints. Included ER diagram and migration scripts.',
    links: [],
    files: ['schema-diagram.png', 'migrations.sql', 'database-design.pdf'],
  },
  {
    id: 5,
    mentee: 'Sarah Chen',
    menteeId: 'mentee-4',
    task: 'Responsive landing page',
    taskId: 'task-5',
    program: 'Frontend Development',
    submittedDate: '2024-02-15',
    hoursAgo: 72,
    priority: 'high',
    hasFiles: true,
    hasLinks: true,
    description: 'Created a fully responsive landing page with hero section, features, testimonials, and contact form. Used CSS Grid and Flexbox for layouts, added smooth scroll animations.',
    links: ['https://landing.example.com', 'https://github.com/sarah/landing-page'],
    files: ['desktop-screenshot.png', 'mobile-screenshot.png'],
  },
];

/**
 * Get submissions filtered by priority
 */
export function getSubmissionsByPriority(priority: 'low' | 'medium' | 'high'): Submission[] {
  return submissionsFixtures.filter((s) => s.priority === priority);
}

/**
 * Get a single submission by ID
 */
export function getSubmissionById(id: number): Submission | undefined {
  return submissionsFixtures.find((s) => s.id === id);
}

/**
 * Get submissions that need urgent attention (>48 hours old)
 */
export function getUrgentSubmissions(): Submission[] {
  return submissionsFixtures.filter((s) => s.hoursAgo > 48);
}

/**
 * Get submissions by mentee ID
 */
export function getSubmissionsByMentee(menteeId: string): Submission[] {
  return submissionsFixtures.filter((s) => s.menteeId === menteeId);
}
