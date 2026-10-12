import { gql } from "@apollo/client";

export const DEV_CREATE_USER = gql`
  mutation DevCreateUser($displayName: String!) {
    devCreateUser(displayName: $displayName) {
      id
      displayName
    }
  }
`;

export const ME = gql`
  query Me {
    me {
      id
      displayName
      units
    }
  }
`;

export const DASHBOARD = gql`
  query Dashboard {
    dashboard {
      sessionsThisWeek
      latestWeight {
        id
        weightKg
        recordedAt
      }
      weightTrend {
        id
        weightKg
        recordedAt
      }
      recentSessions {
        id
        startedAt
        durationMinutes
        milestones {
          type
          value
          exercise {
            name
          }
        }
        sets {
          exercise {
            name
          }
        }
      }
    }
  }
`;

export const LOG_WEIGHT = gql`
  mutation LogWeight($input: LogWeightInput!) {
    logWeight(input: $input) {
      id
      weightKg
      recordedAt
    }
  }
`;

export const WEIGHT_HISTORY = gql`
  query WeightHistory($limit: Int) {
    weightHistory(limit: $limit) {
      id
      weightKg
      bodyFatPercent
      recordedAt
    }
  }
`;

export const EXERCISES = gql`
  query Exercises($search: String) {
    exercises(search: $search) {
      id
      name
      muscleGroup
      equipment
    }
  }
`;

export const WORKOUT_TEMPLATES = gql`
  query WorkoutTemplates {
    workoutTemplates {
      id
      name
      createdAt
      exercises {
        order
        targetSets
        targetReps
        exercise {
          id
          name
        }
      }
    }
  }
`;

export const CREATE_WORKOUT_TEMPLATE = gql`
  mutation CreateWorkoutTemplate($input: CreateWorkoutTemplateInput!) {
    createWorkoutTemplate(input: $input) {
      id
      name
    }
  }
`;

export const WORKOUT_HISTORY = gql`
  query WorkoutHistory($limit: Int) {
    workoutHistory(limit: $limit) {
      id
      startedAt
      durationMinutes
      notes
      sets {
        setNumber
        reps
        weightKg
        exercise {
          name
        }
      }
      milestones {
        type
        value
        exercise {
          name
        }
      }
    }
  }
`;

export const LOG_WORKOUT_SESSION = gql`
  mutation LogWorkoutSession($input: LogWorkoutSessionInput!) {
    logWorkoutSession(input: $input) {
      id
      startedAt
      durationMinutes
      milestones {
        type
        value
        exercise {
          name
        }
      }
    }
  }
`;
