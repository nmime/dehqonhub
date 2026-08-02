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
