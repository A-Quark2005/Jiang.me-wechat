const avatar = require('../../services/avatar');

function presentDemand(rawDemand, expandedApplicationId, contactAccessByUserId) {
  if (!rawDemand) return null;
  const rawApplications = Array.isArray(rawDemand.applications) ? rawDemand.applications : [];
  const rawMyApplication = rawDemand.myApplication || null;
  const myApplicationId = rawMyApplication ? String(rawMyApplication.id || '') : '';
  const applications = rawApplications.map((item) => (
    presentApplication(
      item,
      expandedApplicationId,
      Boolean(myApplicationId && String(item.id || '') === myApplicationId),
      contactAccessByUserId
    )
  ));
  const myApplication = rawMyApplication ? presentApplication(rawMyApplication, '', true, contactAccessByUserId) : null;
  const organizationNames = Array.isArray(rawDemand.organizations)
    ? rawDemand.organizations.map((item) => String(item.name || '').trim()).filter(Boolean)
    : [];
  const organizationText = organizationNames.join('、');
  const applicationLimit = Number(rawDemand.applicationLimit || 1);
  const totalApplicationCount = Number(rawDemand.totalApplicationCount || 0);
  const isOpen = rawDemand.status === 'open';
  const isClosed = rawDemand.status === 'closed';
  const isPoster = Boolean(rawDemand.isPoster);
  const showMyApplication = Boolean(myApplication && !isPoster);
  const showApplyControl = Boolean(!isPoster && (isOpen || showMyApplication));
  const showShareAction = Boolean(isOpen);
  const showCloseAction = Boolean(isPoster && !isClosed);
  const showEditAction = Boolean(isPoster && !isClosed);
  const isFilled = rawDemand.status === 'filled';
  const applyActionEnabled = Boolean(rawDemand.canApply);
  const applyDisabledHint = !isPoster && !myApplication && !applyActionEnabled
    ? rawDemand.applyDisabledReason || ''
    : '';

  return {
    ...rawDemand,
    applications,
    myApplication,
    organizationText,
    hasOrganizations: organizationNames.length > 0,
    requirementText: organizationText || '无认证要求，所有人都可以投递简历',
    hasDescription: Boolean(rawDemand.description),
    hasApplications: applications.length > 0,
    totalApplicationCount,
    applicationLimit,
    candidateCountText: `已收到 ${totalApplicationCount}/${applicationLimit} 份简历`,
    overviewMetaText: isPoster
      ? `已收到 ${totalApplicationCount}/${applicationLimit} 份简历，收满后会自动撤下`
      : `已收到 ${totalApplicationCount}/${applicationLimit} 份简历，符合条件即可投递`,
    showCandidateList: true,
    showBottomBar: Boolean(showApplyControl || showShareAction),
    showApplyControl,
    showShareAction,
    showCloseAction,
    showEditAction,
    closeActionText: isFilled ? '完成征集' : '撤下需求',
    closeModalTitle: isFilled ? '完成征集' : '撤下需求',
    closeModalContent: isFilled
      ? '完成征集后将结束这条已收满的需求，不能继续通过分享链接接收新的简历。已投递的简历仍可在详情页查看。'
      : '撤下后将不再出现在公域需求列表中，也不能继续接收新的简历。已投递的简历仍可在详情页查看。',
    closeModalConfirmText: isFilled ? '完成' : '撤下',
    closeSuccessText: isFilled ? '已完成征集' : '已撤下',
    closeFailureTitle: isFilled ? '完成失败' : '撤下失败',
    applyActionEnabled,
    applyActionText: applyActionEnabled ? '我想试试' : (myApplication ? myApplication.statusText : '暂不符合要求'),
    applyDisabledHint,
    showApplyDisabledHint: Boolean(applyDisabledHint),
    shareTipText: isPoster ? '转发给合适的人，帮我收集更多简历' : '转发给合适的人，一起看看这个需求',
    emptyCandidateText: isPoster ? '还没有人投递，转发后更容易收到简历' : '还没有人投递，可以先投递简历',
    showMyApplication: false,
  };
}

function presentApplication(application, expandedApplicationId, isMine, contactAccessByUserId) {
  const resume = application.resume || {};
  const credentials = Array.isArray(resume.credentials) ? resume.credentials.map(presentCredential) : [];
  const engagements = Array.isArray(resume.engagements) ? resume.engagements.map(presentEngagement) : [];
  const credentialCount = credentials.length;
  const engagementCount = engagements.length;
  const expanded = application.id === expandedApplicationId;
  const publicUserId = application.applicantUserId || resume.publicId || '';
  const contactAccess = contactAccessByUserId && publicUserId ? contactAccessByUserId[String(publicUserId)] : null;
  const hasContactAccess = Boolean((application.contactAccess && application.contactAccess.hasPaid) || (contactAccess && contactAccess.hasPaid));
  return {
    ...application,
    publicUserId,
    expanded,
    isMine: Boolean(isMine),
    detailButtonText: expanded ? '收起' : '查看简历',
    contactButtonText: hasContactAccess ? '查看手机号' : (expanded ? '缴纳定金，添加好友' : '添加好友'),
    showMessage: Boolean(application.message),
    summaryText: `${credentialCount} 个认证，${engagementCount} 条履历`,
    resume: {
      ...resume,
      avatarUrlResolved: avatar.resolveAvatarUrl(resume.avatarUrl),
      displayNameText: resume.displayName || '未命名用户',
      selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
      credentials,
      engagements,
      hasCredentials: credentialCount > 0,
      hasEngagements: engagementCount > 0,
    },
  };
}

function presentCredential(item) {
  return {
    ...item,
    titleText: item.title || item.organizationName || '',
    metaText: item.emailMasked || item.typeLabel || '',
  };
}

function presentEngagement(item) {
  return {
    ...item,
    titleText: item.title || '服务履历',
    metaText: [item.counterpartName, item.confirmedAt ? String(item.confirmedAt).slice(0, 10) : ''].filter(Boolean).join(' · '),
    descriptionText: item.description || '',
  };
}

module.exports = {
  presentDemand,
};
