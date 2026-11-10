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

// ── MVP 2 ──────────────────────────────────────────────────────────────────

export const PLAN_FIELDS = gql`
  fragment PlanFields on ActivePlan {
    programId
    cycleNumber
    startDate
    endDate
    onboardingDays
    daysPerWeek
    dayRange { min max }
    splitLabel
    onboardingPath
    pendingSections
    targets { bmr tdee kcal proteinG carbsG fatG }
    projection { weeks weeklyRateKg endDate }
    sessions {
      templateId
      weekday
      type
      name
      warmup { name dose }
      exercises { exerciseId name pattern sets reps isCore swapped replaces suggestedLoadKg startLoadKg }
    }
    restDays { weekday suggestion }
    adaptations { icon text }
    scheduleSwaps { weekStart dayA dayB }
    profile {
      goal targetWeightKg startWeightKg heightCm sessionMinutes sleepHours equipment experience warmup cardioLikes
      priorityMuscles lowPriorityMuscles reminderTime dietPattern allergies mealPattern fasting prep favouriteDishes
    }
  }
`;

export const MY_PLAN = gql`
  query MyPlan {
    me { id displayName email units appRole showClubs }
    myPlan { ...PlanFields }
  }
  ${PLAN_FIELDS}
`;

export const COMPLETE_ONBOARDING = gql`
  mutation CompleteOnboarding($input: OnboardingInput!) {
    completeOnboarding(input: $input) {
      screenedOut
      message
      plan { ...PlanFields }
    }
  }
  ${PLAN_FIELDS}
`;

export const COMPLETE_QUICK_ONBOARDING = gql`
  mutation CompleteQuickOnboarding($input: QuickOnboardingInput!) {
    completeQuickOnboarding(input: $input) {
      screenedOut
      message
      plan { ...PlanFields }
    }
  }
  ${PLAN_FIELDS}
`;

export const COMPLETE_FUEL_SETUP = gql`
  mutation CompleteFuelSetup($input: FuelSetupInput!) { completeFuelSetup(input: $input) { ...PlanFields } }
  ${PLAN_FIELDS}
`;

export const FINE_TUNE_TRAINING = gql`
  mutation FineTuneTraining($input: TrainingDetailsInput!) { fineTuneTraining(input: $input) { ...PlanFields } }
  ${PLAN_FIELDS}
`;

export const SET_TRAINING_DAYS = gql`
  mutation SetTrainingDays($days: Int!) { setTrainingDays(days: $days) { ...PlanFields } }
  ${PLAN_FIELDS}
`;

export const SET_START_DATE = gql`
  mutation SetStartDate($date: String!) { setStartDate(date: $date) { ...PlanFields } }
  ${PLAN_FIELDS}
`;

export const SWAP_SESSION_DAYS = gql`
  mutation SwapSessionDays($dateA: String!, $dateB: String!) { swapSessionDays(dateA: $dateA, dateB: $dateB) { ...PlanFields } }
  ${PLAN_FIELDS}
`;

export const RESET_WEEK_SCHEDULE = gql`
  mutation ResetWeekSchedule($date: String!) { resetWeekSchedule(date: $date) { ...PlanFields } }
  ${PLAN_FIELDS}
`;

export const SET_REMINDER = gql`
  mutation SetWorkoutReminder($time: String) { setWorkoutReminder(time: $time) { ...PlanFields } }
  ${PLAN_FIELDS}
`;

export const FOOD_LOG_FIELDS = gql`
  fragment FoodLogFields on FoodLog {
    id slot foodKey customFoodId name portionLabel portionIndex grams quantity kcal proteinG carbsG fatG replacedSlotIndex
  }
`;

export const MEAL_DAY_FIELDS = gql`
  fragment MealDayFields on DayMenu {
    date
    proteinShortfallG
    targets { kcal proteinG carbsG fatG }
    items { slotIndex slot recipeKey name portionGuide portionFactor kcal proteinG carbsG fatG eaten skipped }
    foods { ...FoodLogFields }
    water { ml targetMl targetText }
    eaten { kcal proteinG carbsG fatG }
  }
  ${FOOD_LOG_FIELDS}
`;

export const MEAL_DAY = gql`
  query MealDay($date: String!) { mealDay(date: $date) { ...MealDayFields } }
  ${MEAL_DAY_FIELDS}
`;

export const SET_MEAL_EATEN = gql`
  mutation SetMealEaten($date: String!, $slotIndex: Int!, $eaten: Boolean!) {
    setMealEaten(date: $date, slotIndex: $slotIndex, eaten: $eaten) { ...MealDayFields }
  }
  ${MEAL_DAY_FIELDS}
`;

export const MEAL_SWAP_OPTIONS = gql`
  query MealSwapOptions($date: String!, $slotIndex: Int!) {
    mealSwapOptions(date: $date, slotIndex: $slotIndex) { key name slot kcal proteinG portionGuide }
  }
`;

export const SWAP_MEAL = gql`
  mutation SwapMeal($date: String!, $slotIndex: Int!, $recipeKey: String!) {
    swapMeal(date: $date, slotIndex: $slotIndex, recipeKey: $recipeKey) { ...MealDayFields }
  }
  ${MEAL_DAY_FIELDS}
`;

export const MY_FOODS = gql`
  query MyFoods {
    myFoods { custom { id name kcal proteinG carbsG fatG } recent { ...FoodLogFields } }
  }
  ${FOOD_LOG_FIELDS}
`;

export const LOG_FOOD = gql`
  mutation LogFood($input: LogFoodInput!) { logFood(input: $input) { ...MealDayFields } }
  ${MEAL_DAY_FIELDS}
`;

export const CHANGE_FOOD_LOG = gql`
  mutation ChangeFoodLog($id: ID!, $change: FoodLogChange!) { changeFoodLog(id: $id, change: $change) { ...MealDayFields } }
  ${MEAL_DAY_FIELDS}
`;

export const REMOVE_FOOD_LOG = gql`
  mutation RemoveFoodLog($id: ID!) { removeFoodLog(id: $id) { ...MealDayFields } }
  ${MEAL_DAY_FIELDS}
`;

export const SET_WATER = gql`
  mutation SetWater($date: String!, $ml: Int!) { setWater(date: $date, ml: $ml) { ...MealDayFields } }
  ${MEAL_DAY_FIELDS}
`;

export const ACTIVITY_FIELDS = gql`
  fragment ActivityFields on ActivityLog { id performedOn kind activityType durationMinutes distanceKm kcal kcalEstimated avgHeartRate effort }
`;

export const ACTIVITY_LOGS = gql`
  query ActivityLogs($from: String!, $to: String!) { activityLogs(from: $from, to: $to) { ...ActivityFields } }
  ${ACTIVITY_FIELDS}
`;

export const LOG_ACTIVITY = gql`
  mutation LogActivity($input: LogActivityInput!) { logActivity(input: $input) { ...ActivityFields } }
  ${ACTIVITY_FIELDS}
`;

/** Every cycle so far, oldest first: photo history on Progress. */
export const MY_CYCLES = gql`
  query MyCycles { myCycles { cycleNumber startDate endDate active } }
`;

/** Which photo slots hold a photo, so the API's photo reminders skip slots already done. */
export const SYNC_PROGRESS_PHOTOS = gql`
  mutation SyncProgressPhotos($photos: [ProgressPhotoInput!]!) { syncProgressPhotos(photos: $photos) }
`;

export const SESSIONS_BETWEEN = gql`
  query SessionsBetween($from: String!, $to: String!) {
    workoutSessionsBetween(from: $from, to: $to) { id templateId templateName startedAt durationMinutes setCount volumeKg }
  }
`;

export const LAST_SETS = gql`
  query LastSets {
    workoutHistory(limit: 30) { id startedAt sets { setNumber reps weightKg exercise { id } } }
  }
`;

export const LOG_PLANNED_SESSION = gql`
  mutation LogPlannedSession($input: LogWorkoutSessionInput!) {
    logWorkoutSession(input: $input) {
      id
      templateId
      startedAt
      durationMinutes
      setCount
      volumeKg
      milestones { type value exercise { id name } }
    }
  }
`;

export const UPDATE_UNITS = gql`
  mutation UpdateUnits($units: UnitsPreference!) { updateProfile(input: { units: $units }) { id units } }
`;

export const PUSH_CONFIG = gql`
  query PushConfig { pushConfig { publicKey } }
`;

export const SUBSCRIBE_PUSH = gql`
  mutation SubscribePush($input: PushSubscriptionInput!) { subscribePush(input: $input) }
`;

export const UNSUBSCRIBE_PUSH = gql`
  mutation UnsubscribePush($endpoint: String!) { unsubscribePush(endpoint: $endpoint) }
`;

export const SEND_TEST_PUSH = gql`
  mutation SendTestPush { sendTestPush }
`;

export const REMINDER_PREFS = gql`
  query ReminderPrefs { reminderPrefs { weighIn progressPhotos missedSession clubChallenges } }
`;

export const SET_REMINDER_PREFS = gql`
  mutation SetReminderPrefs($input: ReminderPrefsInput!) { setReminderPrefs(input: $input) { weighIn progressPhotos missedSession clubChallenges } }
`;

export const CYCLE_CHECKIN = gql`
  query CycleCheckin($today: String!) {
    cycleCheckin(today: $today) {
      open opensOn cycleNumber currentDays currentKcal goal targetWeightKg dayRange { min max }
      results {
        startKg endKg changeKg plannedChangeKg sessionsPlanned sessionsDone adherence needsWeighIn goalReached
        suggestedDays suggestedTargetKg bestLift { name fromKg toKg }
      }
      eatingLog { loggedDays onTargetDays suggested }
    }
  }
`;

export const PREVIEW_NEXT_CYCLE = gql`
  query PreviewNextCycle($today: String!, $answers: CheckinAnswersInput!, $details: TrainingDetailsInput) {
    previewNextCycle(today: $today, answers: $answers, details: $details) {
      daysPerWeek splitLabel
      targets { kcal proteinG carbsG fatG }
      changes { icon title why }
      sessions { weekday name exercises { name sets reps rotatedFrom startLoadKg } }
    }
  }
`;

export const COMPLETE_CHECKIN = gql`
  mutation CompleteCheckin($today: String!, $answers: CheckinAnswersInput!, $startDate: String!, $details: TrainingDetailsInput) {
    completeCheckin(today: $today, answers: $answers, startDate: $startDate, details: $details) { ...PlanFields }
  }
  ${PLAN_FIELDS}
`;

// ── Clubs ───────────────────────────────────────────────────────────────

export const CLUB_FIELDS = gql`
  fragment ClubFields on Club {
    id name description photoUrl
    me { userId isAdmin isCoach askToShare }
    members { userId displayName isAdmin isCoach isMe joinedAt }
    joinRequests { userId displayName requestedAt }
    invites { id email asAdmin createdAt }
    joinLinks { id url expiresAt maxUses uses }
    limits { maxAdmins maxMembers maxLinkUses linkDays }
    feedLimits { imageMb videoMb videoSeconds coachVideoMb coachVideoSeconds postChars commentChars }
  }
`;

export const MY_CLUBS = gql`
  query MyClubs {
    myClubs { id name description status }
    myClubInvites { id clubName asAdmin token }
  }
`;

export const CLUB = gql`
  query Club($id: ID!) { club(id: $id) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

export const JOIN_PREVIEW = gql`
  query JoinPreview($token: String!) {
    joinPreview(token: $token) { clubName description kind asAdmin problem emailHint myStatus clubId }
  }
`;

export const JOIN_CLUB = gql`
  mutation JoinClub($token: String!, $consent: Boolean!) { joinClub(token: $token, consent: $consent) { clubId status } }
`;

export const DECLINE_CLUB_INVITE = gql`
  mutation DeclineClubInvite($id: ID!) { declineClubInvite(id: $id) }
`;

export const LEAVE_CLUB = gql`
  mutation LeaveClub($clubId: ID!, $deleteMyPosts: Boolean) { leaveClub(clubId: $clubId, deleteMyPosts: $deleteMyPosts) }
`;

export const INVITE_TO_CLUB = gql`
  mutation InviteToClub($clubId: ID!, $emails: [String!]!) { inviteToClub(clubId: $clubId, emails: $emails) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

export const REVOKE_CLUB_INVITE = gql`
  mutation RevokeClubInvite($id: ID!) { revokeClubInvite(id: $id) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

export const CREATE_JOIN_LINK = gql`
  mutation CreateJoinLink($clubId: ID!, $maxUses: Int) { createJoinLink(clubId: $clubId, maxUses: $maxUses) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

export const TURN_OFF_JOIN_LINK = gql`
  mutation TurnOffJoinLink($id: ID!) { turnOffJoinLink(id: $id) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

export const RESPOND_TO_JOIN_REQUEST = gql`
  mutation RespondToJoinRequest($clubId: ID!, $userId: ID!, $approve: Boolean!) {
    respondToJoinRequest(clubId: $clubId, userId: $userId, approve: $approve) { ...ClubFields }
  }
  ${CLUB_FIELDS}
`;

export const SET_CLUB_MEMBER_ROLES = gql`
  mutation SetClubMemberRoles($clubId: ID!, $userId: ID!, $isAdmin: Boolean!, $isCoach: Boolean!) {
    setClubMemberRoles(clubId: $clubId, userId: $userId, isAdmin: $isAdmin, isCoach: $isCoach) { ...ClubFields }
  }
  ${CLUB_FIELDS}
`;

export const REMOVE_CLUB_MEMBER = gql`
  mutation RemoveClubMember($clubId: ID!, $userId: ID!) { removeClubMember(clubId: $clubId, userId: $userId) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

// ── Console (App Owner and App Admins) ──────────────────────────────────

export const CONSOLE_CLUB_FIELDS = gql`
  fragment ConsoleClubFields on ConsoleClub { id name description createdAt closedAt memberCount adminCount pendingAdminEmails }
`;

export const CONSOLE = gql`
  query Console {
    consoleClubs { ...ConsoleClubFields }
    appStaff { userId displayName email role grantedAt }
  }
  ${CONSOLE_CLUB_FIELDS}
`;

export const CREATE_CLUB = gql`
  mutation CreateClub($input: CreateClubInput!) { createClub(input: $input) { ...ConsoleClubFields } }
  ${CONSOLE_CLUB_FIELDS}
`;

export const CLOSE_CLUB = gql`
  mutation CloseClub($id: ID!) { closeClub(id: $id) { ...ConsoleClubFields } }
  ${CONSOLE_CLUB_FIELDS}
`;

export const ADD_CLUB_ADMIN_FROM_CONSOLE = gql`
  mutation AddClubAdminFromConsole($clubId: ID!, $email: String!) { addClubAdminFromConsole(clubId: $clubId, email: $email) { ...ConsoleClubFields } }
  ${CONSOLE_CLUB_FIELDS}
`;

export const ADD_APP_ADMIN = gql`
  mutation AddAppAdmin($email: String!) { addAppAdmin(email: $email) { userId displayName email role grantedAt } }
`;

export const REMOVE_APP_ADMIN = gql`
  mutation RemoveAppAdmin($userId: ID!) { removeAppAdmin(userId: $userId) { userId displayName email role grantedAt } }
`;

// ── Clubs feed ──────────────────────────────────────────────────────────

export const CLUB_PERSON_FIELDS = gql`
  fragment ClubPersonFields on ClubPerson { userId displayName isAdmin isCoach inClub isMe }
`;

export const CLUB_WORKOUT_FIELDS = gql`
  fragment ClubWorkoutFields on ClubWorkout {
    id name startedAt durationMinutes setCount volumeKg
    exercises { name sets { reps weightKg } }
    prs { exerciseName type weightKg reps value }
  }
`;

export const CLUB_ACTIVITY_FIELDS = gql`
  fragment ClubActivityFields on ClubActivity { id activityType label performedOn durationMinutes distanceKm avgHeartRate effort kcal }
`;

export const CLUB_POST_FIELDS = gql`
  fragment ClubPostFields on ClubPost {
    id clubId kind body createdAt editedAt hasPr weightChangeKg canEdit canDelete commentCount myReaction
    author { ...ClubPersonFields }
    media { id kind url durationSeconds }
    workout { ...ClubWorkoutFields }
    activity { ...ClubActivityFields }
    reactions { reaction count }
    challenge { id title }
  }
  ${CLUB_PERSON_FIELDS}
  ${CLUB_WORKOUT_FIELDS}
  ${CLUB_ACTIVITY_FIELDS}
`;

export const CLUB_FEED = gql`
  query ClubFeed($id: ID!, $filter: ClubFeedFilter, $after: String) {
    club(id: $id) { id feed(filter: $filter, after: $after, limit: 20) { nextCursor posts { ...ClubPostFields } } }
  }
  ${CLUB_POST_FIELDS}
`;

export const CLUB_COMMENT_FIELDS = gql`
  fragment ClubCommentFields on ClubComment { id body createdAt canDelete author { ...ClubPersonFields } media { id kind url durationSeconds } }
  ${CLUB_PERSON_FIELDS}
`;

export const CLUB_POST = gql`
  query ClubPost($id: ID!) { clubPost(id: $id) { ...ClubPostFields comments { ...ClubCommentFields } } }
  ${CLUB_POST_FIELDS}
  ${CLUB_COMMENT_FIELDS}
`;

export const REQUEST_CLUB_UPLOAD = gql`
  mutation RequestClubUpload($clubId: ID!, $purpose: ClubUploadPurpose!, $contentType: String!, $sizeBytes: Int!, $durationSeconds: Float) {
    requestClubUpload(clubId: $clubId, purpose: $purpose, contentType: $contentType, sizeBytes: $sizeBytes, durationSeconds: $durationSeconds) {
      mediaId url method headers { name value } maxBytes
    }
  }
`;

export const CREATE_CLUB_POST = gql`
  mutation CreateClubPost($input: CreateClubPostInput!) { createClubPost(input: $input) { ...ClubPostFields } }
  ${CLUB_POST_FIELDS}
`;

export const EDIT_CLUB_POST = gql`
  mutation EditClubPost($id: ID!, $body: String!) { editClubPost(id: $id, body: $body) { id body editedAt } }
`;

export const DELETE_CLUB_POST = gql`
  mutation DeleteClubPost($id: ID!) { deleteClubPost(id: $id) }
`;

export const REACT_TO_CLUB_POST = gql`
  mutation ReactToClubPost($postId: ID!, $reaction: ClubReaction) {
    reactToClubPost(postId: $postId, reaction: $reaction) { id myReaction reactions { reaction count } }
  }
`;

export const COMMENT_ON_CLUB_POST = gql`
  mutation CommentOnClubPost($postId: ID!, $body: String, $mediaId: ID) {
    commentOnClubPost(postId: $postId, body: $body, mediaId: $mediaId) { id commentCount comments { ...ClubCommentFields } }
  }
  ${CLUB_COMMENT_FIELDS}
`;

export const DELETE_CLUB_COMMENT = gql`
  mutation DeleteClubComment($id: ID!) { deleteClubComment(id: $id) { id commentCount comments { ...ClubCommentFields } } }
  ${CLUB_COMMENT_FIELDS}
`;

export const REPORT_CLUB_POST = gql`
  mutation ReportClubPost($postId: ID!, $commentId: ID, $reason: String!) { reportClubPost(postId: $postId, commentId: $commentId, reason: $reason) }
`;

export const SET_CLUB_SHARE_SETTING = gql`
  mutation SetClubShareSetting($clubId: ID!, $askToShare: Boolean!) { setClubShareSetting(clubId: $clubId, askToShare: $askToShare) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

export const SET_CLUB_PHOTO = gql`
  mutation SetClubPhoto($clubId: ID!, $mediaId: ID) { setClubPhoto(clubId: $clubId, mediaId: $mediaId) { ...ClubFields } }
  ${CLUB_FIELDS}
`;

export const CLUB_SHARE_DRAFT = gql`
  query ClubShareDraft($sessionId: ID, $activityId: ID) { clubShareDraft(sessionId: $sessionId, activityId: $activityId) { text clubs { id name } } }
`;

export const CLUB_COACH_OVERVIEW = gql`
  query ClubCoachOverview($id: ID!) {
    club(id: $id) { id coachOverview { member { userId displayName isAdmin isCoach joinedAt } sessionsPerWeek workouts activities prs lastWorkoutAt lastActivityOn challengesTaken challengesCompleted } }
  }
`;

export const CLUB_MEMBER_LOG = gql`
  query ClubMemberLog($clubId: ID!, $userId: ID!) {
    clubMemberLog(clubId: $clubId, userId: $userId) {
      member { userId displayName joinedAt }
      workouts { ...ClubWorkoutFields }
      activities { ...ClubActivityFields }
    }
  }
  ${CLUB_WORKOUT_FIELDS}
  ${CLUB_ACTIVITY_FIELDS}
`;

export const CONSOLE_REPORTS = gql`
  query ConsoleReports {
    consoleReports { id clubName reason createdAt reporterName reportCount item { postId commentId kind authorName body createdAt deleted media { id kind url } } }
  }
`;

export const RESOLVE_CLUB_REPORT = gql`
  mutation ResolveClubReport($id: ID!, $remove: Boolean!) { resolveClubReport(id: $id, remove: $remove) }
`;

// ── Club routines ───────────────────────────────────────────────────────

export const CLUB_ROUTINE_FIELDS = gql`
  fragment ClubRoutineFields on ClubRoutine {
    id clubId clubName title description kind weekdays activityType activityLabel minDistanceKm minMinutes createdAt
    exercises { exerciseId name sets reps }
  }
`;

export const CLUB_ROUTINES = gql`
  query ClubRoutines($id: ID!) { club(id: $id) { id routineLimit routines { ...ClubRoutineFields } } }
  ${CLUB_ROUTINE_FIELDS}
`;

export const MY_CLUB_ROUTINES = gql`
  query MyClubRoutines($date: String!) { myClubRoutines(date: $date) { done routine { ...ClubRoutineFields } } }
  ${CLUB_ROUTINE_FIELDS}
`;

export const CLUB_ROUTINE_PROGRESS = gql`
  query ClubRoutineProgress($id: ID!, $today: String!) {
    clubRoutineProgress(id: $id, today: $today, weeks: 6) {
      weekStarts
      routine { ...ClubRoutineFields }
      members { userId displayName isMe streak doneToday weeks { weekStart done scheduled } }
    }
  }
  ${CLUB_ROUTINE_FIELDS}
`;

export const CREATE_CLUB_ROUTINE = gql`
  mutation CreateClubRoutine($clubId: ID!, $input: ClubRoutineInput!) { createClubRoutine(clubId: $clubId, input: $input) { ...ClubRoutineFields } }
  ${CLUB_ROUTINE_FIELDS}
`;

export const UPDATE_CLUB_ROUTINE = gql`
  mutation UpdateClubRoutine($id: ID!, $input: ClubRoutineInput!) { updateClubRoutine(id: $id, input: $input) { ...ClubRoutineFields } }
  ${CLUB_ROUTINE_FIELDS}
`;

export const ARCHIVE_CLUB_ROUTINE = gql`
  mutation ArchiveClubRoutine($id: ID!) { archiveClubRoutine(id: $id) }
`;

export const LOG_CLUB_ROUTINE_WORKOUT = gql`
  mutation LogClubRoutineWorkout($routineId: ID!, $date: String!, $durationMinutes: Int, $weights: [ClubRoutineWeightInput!]) {
    logClubRoutineWorkout(routineId: $routineId, date: $date, durationMinutes: $durationMinutes, weights: $weights) { done routine { id } }
  }
`;

// ── Club challenges ─────────────────────────────────────────────────────

export const CLUB_CHALLENGE_FIELDS = gql`
  fragment ClubChallengeFields on ClubChallenge {
    id clubId clubName title description cadence kind startsOn endsOn state createdAt totalPeriods joinedCount myAnswer canEnd
    timeLimitMinutes activityType activityLabel minDistanceKm minMinutes foodKey foodName foodGrams foodUnit waterMl
    coach { ...ClubPersonFields }
    video { id kind url durationSeconds }
    exercises { exerciseId name sets reps }
  }
  ${CLUB_PERSON_FIELDS}
`;

export const MY_CLUB_CHALLENGE_FIELDS = gql`
  fragment MyClubChallengeFields on MyClubChallenge { doneForPeriod done total completed winDraft challenge { ...ClubChallengeFields } }
  ${CLUB_CHALLENGE_FIELDS}
`;

export const CLUB_CHALLENGES = gql`
  query ClubChallenges($id: ID!) { club(id: $id) { id challengeQuota { limit usedThisWeek } challenges { ...ClubChallengeFields } } }
  ${CLUB_CHALLENGE_FIELDS}
`;

export const MY_CLUB_CHALLENGES = gql`
  query MyClubChallenges($date: String!) { myClubChallenges(date: $date) { ...MyClubChallengeFields } }
  ${MY_CLUB_CHALLENGE_FIELDS}
`;

export const PENDING_CLUB_CHALLENGES = gql`
  query PendingClubChallenges($date: String!) { pendingClubChallenges(date: $date) { ...ClubChallengeFields } }
  ${CLUB_CHALLENGE_FIELDS}
`;

export const CLUB_CHALLENGE = gql`
  query ClubChallenge($id: ID!) {
    clubChallenge(id: $id) {
      challenge { ...ClubChallengeFields }
      mine { ...MyClubChallengeFields }
      participants {
        person { ...ClubPersonFields } done total completed
        entries { id onDate periodStart resultSeconds resultReps distanceKm minutes waterMl note createdAt proof { id kind url durationSeconds } }
      }
      comments { id body createdAt canDelete author { ...ClubPersonFields } }
    }
  }
  ${MY_CLUB_CHALLENGE_FIELDS}
`;

export const CREATE_CLUB_CHALLENGE = gql`
  mutation CreateClubChallenge($clubId: ID!, $input: ClubChallengeInput!) { createClubChallenge(clubId: $clubId, input: $input) { ...ClubChallengeFields } }
  ${CLUB_CHALLENGE_FIELDS}
`;

export const END_CLUB_CHALLENGE = gql`
  mutation EndClubChallenge($id: ID!) { endClubChallenge(id: $id) }
`;

export const RESPOND_TO_CLUB_CHALLENGE = gql`
  mutation RespondToClubChallenge($id: ID!, $join: Boolean!) { respondToClubChallenge(id: $id, join: $join) { id myAnswer joinedCount } }
`;

export const SUBMIT_CLUB_CHALLENGE_ENTRY = gql`
  mutation SubmitClubChallengeEntry($challengeId: ID!, $input: ClubChallengeEntryInput!) {
    submitClubChallengeEntry(challengeId: $challengeId, input: $input) { completed mine { ...MyClubChallengeFields } }
  }
  ${MY_CLUB_CHALLENGE_FIELDS}
`;

export const POST_CLUB_CHALLENGE_WIN = gql`
  mutation PostClubChallengeWin($challengeId: ID!, $body: String) { postClubChallengeWin(challengeId: $challengeId, body: $body) { id } }
`;

export const COMMENT_ON_CLUB_CHALLENGE = gql`
  mutation CommentOnClubChallenge($id: ID!, $body: String!) { commentOnClubChallenge(id: $id, body: $body) { comments { id } } }
`;

export const DELETE_CLUB_CHALLENGE_COMMENT = gql`
  mutation DeleteClubChallengeComment($id: ID!) { deleteClubChallengeComment(id: $id) { comments { id } } }
`;
