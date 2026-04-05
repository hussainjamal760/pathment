import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export interface RoadmapTask {
  id: string;
  week: number;
  title: string;
  description: string;
  estimatedHours?: number;
}

export interface CustomTaskData {
  title: string;
  description: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  resources: string[];
}

export interface TaskAssignmentFormData {
  taskType: 'roadmap' | 'custom';
  selectedMentee: string;
  selectedRoadmapTask: string;
  customTask: CustomTaskData;
}

export function useTaskAssignment() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState<TaskAssignmentFormData>({
    taskType: 'roadmap',
    selectedMentee: '',
    selectedRoadmapTask: '',
    customTask: {
      title: '',
      description: '',
      dueDate: '',
      priority: 'medium',
      resources: ['']
    }
  });

  const updateFormData = (updates: Partial<TaskAssignmentFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const updateCustomTask = (updates: Partial<CustomTaskData>) => {
    setFormData(prev => ({
      ...prev,
      customTask: { ...prev.customTask, ...updates }
    }));
  };

  const addResource = () => {
    setFormData(prev => ({
      ...prev,
      customTask: {
        ...prev.customTask,
        resources: [...prev.customTask.resources, '']
      }
    }));
  };

  const updateResource = (index: number, value: string) => {
    setFormData(prev => {
      const newResources = [...prev.customTask.resources];
      newResources[index] = value;
      return {
        ...prev,
        customTask: {
          ...prev.customTask,
          resources: newResources
        }
      };
    });
  };

  const removeResource = (index: number) => {
    setFormData(prev => ({
      ...prev,
      customTask: {
        ...prev.customTask,
        resources: prev.customTask.resources.filter((_, i) => i !== index)
      }
    }));
  };

  const resetForm = () => {
    setFormData({
      taskType: 'roadmap',
      selectedMentee: '',
      selectedRoadmapTask: '',
      customTask: {
        title: '',
        description: '',
        dueDate: '',
        priority: 'medium',
        resources: ['']
      }
    });
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.selectedMentee) {
      toast.error('Please select a mentee');
      return;
    }

    if (formData.taskType === 'roadmap' && !formData.selectedRoadmapTask) {
      toast.error('Please select a roadmap task');
      return;
    }

    if (formData.taskType === 'custom') {
      if (!formData.customTask.title || !formData.customTask.description) {
        toast.error('Please fill in all required fields');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // TODO: Implement actual API call when endpoint is ready
      // const payload = formData.taskType === 'roadmap' 
      //   ? { menteeId: formData.selectedMentee, roadmapTaskId: formData.selectedRoadmapTask }
      //   : { menteeId: formData.selectedMentee, ...formData.customTask };
      // await taskApi.assignTask(payload);
      
      // Simulated API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast.success('Task assigned successfully!');
      resetForm();
      router.push('/mentor/tasks');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to assign task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    formData,
    isSubmitting,
    updateFormData,
    updateCustomTask,
    addResource,
    updateResource,
    removeResource,
    handleSubmit,
    resetForm,
  };
}
