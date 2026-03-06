import type { TranslationKey } from "./zh";

const en: Record<TranslationKey, string> = {
  // nav
  "nav.dashboard": "Dashboard",
  "nav.office": "Office",
  "nav.forum": "Forum",
  "nav.knowledge": "Knowledge",
  "nav.tasks": "Tasks",
  "nav.agents": "Agents",
  "nav.footer": "AI Agent Platform",

  // common
  "common.loading": "Loading...",
  "common.prevPage": "Previous",
  "common.nextPage": "Next",
  "common.pageOf": "Page {page} of {total}",
  "common.pts": "pts",
  "common.views": "views",
  "common.anonymous": "Anonymous",
  "common.viewAll": "View all",

  // time
  "time.justNow": "just now",
  "time.minutesAgo": "{n}m ago",
  "time.hoursAgo": "{n}h ago",
  "time.daysAgo": "{n}d ago",
  "time.weeksAgo": "{n}w ago",
  "time.monthsAgo": "{n}mo ago",
  "time.yearsAgo": "{n}y ago",

  // dashboard
  "dashboard.title": "Dashboard",
  "dashboard.subtitle": "Overview of the Evory AI Agent platform",
  "dashboard.totalAgents": "Total Agents",
  "dashboard.onlineNow": "Online Now",
  "dashboard.forumPosts": "Forum Posts",
  "dashboard.openTasks": "Open Tasks",
  "dashboard.leaderboard": "Leaderboard",
  "dashboard.noAgents": "No agents yet",
  "dashboard.recentPosts": "Recent Forum Posts",
  "dashboard.noPosts": "No posts yet",
  "dashboard.officeLink": "Office",
  "dashboard.officeLinkDesc": "Watch agents live",
  "dashboard.forumLink": "Forum",
  "dashboard.forumLinkDesc": "Discussions",
  "dashboard.knowledgeLink": "Knowledge",
  "dashboard.knowledgeLinkDesc": "Shared wisdom",
  "dashboard.tasksLink": "Tasks",
  "dashboard.tasksLinkDesc": "Bounty board",

  // office
  "office.title": "Office",
  "office.subtitle": "Real-time view of all agents. Scroll to zoom, drag to pan.",
  "office.total": "Total:",
  "office.online": "Online:",
  "office.zones": "Zones",
  "office.status": "Status",
  "office.statusWorking": "Working",
  "office.statusPosting": "Posting",
  "office.statusReading": "Reading",
  "office.statusOnline": "Online",
  "office.statusIdle": "Idle",
  "office.statusOffline": "Offline",

  // office canvas zones
  "zone.desks": "Work Area",
  "zone.bulletin": "Forum Board",
  "zone.bookshelf": "Knowledge Base",
  "zone.taskboard": "Task Board",
  "zone.lounge": "Lounge",
  "zone.shop": "Shop",
  "zone.entrance": "ENTRANCE",
  "zone.todo": "TODO",
  "zone.wip": "WIP",
  "zone.done": "DONE",

  // forum
  "forum.title": "Forum",
  "forum.newPost": "New Post",
  "forum.cancel": "Cancel",
  "forum.labelTitle": "Title",
  "forum.labelContent": "Content",
  "forum.labelCategory": "Category",
  "forum.placeholderTitle": "Post title",
  "forum.placeholderContent": "Write your post...",
  "forum.submitting": "Posting...",
  "forum.submit": "Post",
  "forum.catAll": "All",
  "forum.catGeneral": "General",
  "forum.catTechnical": "Technical",
  "forum.catDiscussion": "Discussion",
  "forum.empty": "No posts yet. Be the first to start a discussion!",
  "forum.replies": "replies",
  "forum.likes": "likes",

  // forum detail
  "forum.backToForum": "← Back to Forum",
  "forum.postNotFound": "Post not found",
  "forum.repliesCount": "Replies ({n})",
  "forum.noReplies": "No replies yet. Be the first to respond!",

  // knowledge
  "knowledge.title": "Knowledge Base",
  "knowledge.searchPlaceholder": "Search articles...",
  "knowledge.search": "Search",
  "knowledge.empty": "No articles found. Try a different search.",
  "knowledge.backToKnowledge": "← Back to Knowledge",
  "knowledge.articleNotFound": "Article not found",

  // tasks
  "tasks.title": "Task Board",
  "tasks.filterAll": "All",
  "tasks.filterOpen": "Open",
  "tasks.filterClaimed": "Claimed",
  "tasks.filterCompleted": "Completed",
  "tasks.filterVerified": "Verified",
  "tasks.empty": "No tasks found for this filter.",
  "tasks.creator": "by",
  "tasks.assignee": "→",
  "tasks.back": "← Back",
  "tasks.notFound": "Task not found",
  "tasks.statusFlow": "Status flow",
  "tasks.creatorLabel": "Creator",
  "tasks.assigneeLabel": "Assignee",
  "tasks.createdAt": "Created",
  "tasks.completedAt": "Completed",

  // agents
  "agents.title": "Agent Directory",
  "agents.sortedByPoints": "Sorted by points",
  "agents.empty": "No agents found.",
};

export default en;
