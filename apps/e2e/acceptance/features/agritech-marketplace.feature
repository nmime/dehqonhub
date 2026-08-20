Feature: AgriTech marketplace operations protect every actor

  @REQ-AGRITECH-PARTNER-007
  Rule: Only approved organizations can trade

    @SCN-AGRITECH-PARTNER-01
    Scenario: A pending buyer cannot reserve produce
      Given a pending AgriTech buyer
      When the buyer's marketplace permission is evaluated
      Then the buyer is blocked from marketplace trading

    @SCN-AGRITECH-PARTNER-02
    Scenario: An approved buyer can trade
      Given an approved AgriTech buyer
      When the buyer's marketplace permission is evaluated
      Then the buyer is allowed to trade

  @REQ-AGRITECH-OUTPUT-008
  Rule: Produce reservations never oversell a listing

    @SCN-AGRITECH-OUTPUT-01
    Scenario: A buyer reserves an available quantity
      Given an active produce listing with 100 kilograms available
      When the buyer requests 25 kilograms
      Then the produce reservation is allowed

    @SCN-AGRITECH-OUTPUT-02
    Scenario: A buyer requests more than remains
      Given an active produce listing with 20 kilograms available
      When the buyer requests 25 kilograms
      Then the produce reservation is rejected

  @REQ-AGRITECH-FULFILLMENT-010
  Rule: Delivery completion requires evidence

    @SCN-AGRITECH-FULFILLMENT-01
    Scenario: A field agent cannot complete delivery without proof
      Given an in-transit AgriTech delivery without proof
      When the field agent attempts to complete the delivery
      Then delivery completion is rejected

    @SCN-AGRITECH-FULFILLMENT-02
    Scenario: A field agent completes delivery with proof
      Given an in-transit AgriTech delivery with proof
      When the field agent attempts to complete the delivery
      Then delivery completion is allowed

  @REQ-AGRITECH-MARKETPLACE-016
  Rule: DehqonHub commercial journeys remain seller isolated and party owned

    @SCN-AGRITECH-MARKETPLACE-01
    Scenario: Approved publication identity derives separate seller carts
      Given a verified DehqonHub buyer and products from sellers "seller-a" and "seller-b"
      When the buyer adds both products using only approved publication identity and quantity
      Then two open carts persist with one cart for each seller organization

    @SCN-AGRITECH-MARKETPLACE-02
    Scenario: Checkout persists reviewable commercial terms
      Given a verified DehqonHub buyer has an open seller cart
      When the buyer confirms pickup and checks out the cart
      Then the cart closes and the returned draft contract persists its parties, lines, amount, and delivery terms

    @SCN-AGRITECH-MARKETPLACE-03
    Scenario: Choosing an offer persists the selected contract
      Given a verified buyer owns an open request with an offer from a verified seller
      When the buyer chooses that offer
      Then the request and offer are selected and one matching draft contract is returned for review

    @REQ-AGRITECH-PARTNER-007 @SCN-AGRITECH-MARKETPLACE-05
    Scenario: Verification does not replace organization approval
      Given a verified DehqonHub buyer without an approved buyer organization can discover an active product
      When the unapproved buyer attempts to add the product to a cart
      Then the cart addition is denied without a cart or contract

    @SCN-AGRITECH-MARKETPLACE-06
    Scenario: An unverified user cannot create a seller cart
      Given an unverified DehqonHub user can discover an active product
      When the unverified user attempts to add the product to a cart
      Then the cart mutation is denied and no seller cart is persisted

  @REQ-AGRITECH-PUBLIC-018
  Rule: Anonymous marketplace discovery is opt-in, moderated, and privacy bounded

    @SCN-AGRITECH-PUBLIC-01
    Scenario: An approved publication is visible across organizations
      Given approved opt-in DehqonHub listing, seller, and purchase-request publications
      When a guest reads the public marketplace projection without a tenant selector
      Then the approved Product, Produce, seller, and request records are anonymously discoverable

    @SCN-AGRITECH-PUBLIC-02
    Scenario: An ineligible publication is indistinguishable from absence
      Given pending, rejected, paused, suspended, revoked, inactive, exhausted, or expired public records
      When a guest reads the public marketplace projection without a tenant selector
      Then no public listing, seller, suggestion, or request record is returned

    @SCN-AGRITECH-PUBLIC-03
    Scenario: Public payloads remain discriminated, localized, and allowlisted
      Given approved opt-in DehqonHub listing, seller, and purchase-request publications
      When a guest reads the public marketplace projection without a tenant selector
      Then Product and Produce remain explicitly discriminated with four authored titles and no private fields

    @SCN-AGRITECH-PUBLIC-04
    Scenario: Publication authorization and replay do not create duplicate rows
      Given a verified approved seller owns an eligible private source
      When the seller publishes it, replays the command, changes the replayed input, and a foreign tenant tries the source
      Then one pending-moderation publication exists, the exact replay matches, and both invalid attempts fail closed

    @SCN-AGRITECH-PUBLIC-05
    Scenario: Descriptive edits await review while current stock remains authoritative
      Given approved listing and seller snapshots have unreviewed descriptive edits and one source reaches zero stock
      When a guest reads the public marketplace projection without a tenant selector
      Then only the prior reviewed listing and seller descriptions are visible, the current price is used, and the exhausted source is hidden

    @SCN-AGRITECH-PUBLIC-06
    Scenario: Listing and seller-profile moderation are independently revision bound
      Given independently pending listing and seller-profile revisions with exact queue fingerprints
      When two authorized reviewers decide the listing concurrently, replay the winner, and challenge the seller-profile fingerprint
      Then one listing decision persists without deciding the seller, both exact replays match, and stale decisions and fingerprints conflict

    @SCN-AGRITECH-PUBLIC-07
    Scenario: Anonymous pagination is bounded and keyset based
      Given approved public listings that span more than one bounded page
      When a guest follows the opaque cursor and submits malformed, extra-field, oversized, and wrong-sort cursors
      Then valid pages respect the limit and invalid cursors fail before a persistence query without using an offset

    @SCN-AGRITECH-PUBLIC-08
    Scenario: Seller-profile rejection affects only listings pinned to that revision
      Given pending listings pin a newer seller-profile revision and queue fingerprint beside prior approved public records
      When an authorized administrator rejects the newer seller-profile revision
      Then only pending listings pinned to that rejected revision terminate, its fingerprint is canonical, and prior public records remain visible

  @REQ-AGRITECH-INTEGRATION-013 @REQ-AGRITECH-STAGE2-017
  Rule: Simulated external evidence never replaces real marketplace authority

    @SCN-AGRITECH-STAGE2-01
    Scenario: Mock identity and documents remain pending for administrator review
      Given an authenticated DehqonHub applicant uses non-production mock verification providers
      When the applicant creates a buyer case and repeats the same OneID and document commands
      And the applicant submits the completed verification evidence
      Then each external command executes once and replays its persisted result
      And the verification case remains pending with explicit mock provenance

  @REQ-AGRITECH-STAGE2-017
  Rule: Promotion activation is bounded and catalog only

    @SCN-AGRITECH-STAGE2-02
    Scenario: Promotion is catalog-only
      Given an approved seller owns two moderated catalog listings
      When the seller activates a bounded promotion and retries the same command
      Then one promotion persists with the selected server plan and the promoted listing ranks first with an Ad disclosure
      And exactly one simulated charge is recorded, no slot serves unpaid, and an unavailable billing capability refuses the paid action

    @SCN-AGRITECH-STAGE2-03
    Scenario: Confirmed AI starter cart is exactly once
      Given a verified buyer receives a grounded AI preview across two approved sellers
      When the buyer cancels the preview, confirms it, retries the same command, and changes the replayed input
      Then cancellation creates nothing, the exact replay returns two seller carts, and the changed command conflicts
      And the grounded AI payload contains only opaque publication identities and semantic result codes
      And consultation creation replays exactly, translated titles remain stable, and an unpublished listing requires refresh
