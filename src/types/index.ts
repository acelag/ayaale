export type ProjectStatus = 'concept' | 'planning' | 'in_progress' | 'launched' | 'paused';
export interface Project {
    id: string;
    name: string;
    description: string;
    icon: string;
    status: ProjectStatus;
    progressPercent?: number;
}
export const categories = ['Business', 'Travel', 'Food', 'Technology', 'Other'] as const;
export type IdeaCategory = typeof categories[number];
export interface Idea {
    id: string;
    title: string;
    description?: string;
    category: IdeaCategory;
    createdAt: string;
}
export interface Milestone {
    id: string;
    title: string;
    details?: string;
    projectId?: string;
    status: 'todo' | 'in_progress' | 'done';
    dueDate?: string;
}
