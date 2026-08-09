Feature: Public marketplace engagement remains governed

  @REQ-AGRITECH-ENGAGEMENT-019
  Rule: Engagement uses opaque listings, exact parties, and durable limits

    Background:
      Given a governed public listing and authenticated engagement parties

    @SCN-AGRITECH-ENGAGEMENT-01
    Scenario: Favorite replay is actor and operation scoped
      When the buyer exercises opaque favorite replay across two listings
      Then one favorite persists and changed-resource key reuse conflicts

    @SCN-AGRITECH-ENGAGEMENT-02
    Scenario: Monthly sample quota and exact-party transitions are bounded
      When the verified buyer races the fifth and sixth monthly sample requests
      Then only five samples persist and exact parties complete the requester-paid sample flow

    @SCN-AGRITECH-ENGAGEMENT-03
    Scenario: Deal review reporting and moderation stay independent
      When the eligible buyer reviews, the seller replies, and an administrator hides the reported review
      Then one deal-verified review is private-field free and moderation alone removes its aggregate
