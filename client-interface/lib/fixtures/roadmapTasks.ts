/**
 * Development fixtures for roadmap tasks
 * These are mock data used for development and should be replaced with API calls in production
 */

export interface RoadmapTaskFixture {
  id: string;
  week: number;
  title: string;
  description: string;
  estimatedHours: number;
}

export const roadmapTasksFixtures: RoadmapTaskFixture[] = [
  {
    id: '1',
    week: 3,
    title: 'Build a React component library',
    description: 'Create reusable React components with TypeScript',
    estimatedHours: 8
  },
  {
    id: '2',
    week: 3,
    title: 'Implement user authentication',
    description: 'Add JWT-based authentication to your application',
    estimatedHours: 6
  },
  {
    id: '3',
    week: 4,
    title: 'Create REST API endpoints',
    description: 'Build CRUD operations for your application',
    estimatedHours: 10
  },
  {
    id: '4',
    week: 4,
    title: 'Database design and schema',
    description: 'Design and implement PostgreSQL database schema',
    estimatedHours: 8
  },
  {
    id: '5',
    week: 5,
    title: 'Implement state management',
    description: 'Add Redux or Context API for global state',
    estimatedHours: 6
  },
  {
    id: '6',
    week: 5,
    title: 'Build responsive layouts',
    description: 'Create mobile-first responsive designs with Tailwind CSS',
    estimatedHours: 7
  },
  {
    id: '7',
    week: 6,
    title: 'Add automated testing',
    description: 'Write unit and integration tests with Jest and React Testing Library',
    estimatedHours: 10
  },
  {
    id: '8',
    week: 6,
    title: 'Implement file upload',
    description: 'Add file upload functionality with validation and preview',
    estimatedHours: 5
  },
];

export function getRoadmapTasksByWeek(week: number): RoadmapTaskFixture[] {
  return roadmapTasksFixtures.filter(task => task.week === week);
}

export function getRoadmapTaskById(id: string): RoadmapTaskFixture | undefined {
  return roadmapTasksFixtures.find(task => task.id === id);
}
