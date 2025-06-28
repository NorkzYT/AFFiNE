// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct UpdateUserSettingsInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    receiveInvitationEmail: GraphQLNullable<Bool> = nil,
    receiveMentionEmail: GraphQLNullable<Bool> = nil,
    twoFactorEnabled: GraphQLNullable<Bool> = nil
  ) {
    __data = InputDict([
      "receiveInvitationEmail": receiveInvitationEmail,
      "receiveMentionEmail": receiveMentionEmail,
      "twoFactorEnabled": twoFactorEnabled
    ])
  }

  /// Receive invitation email
  public var receiveInvitationEmail: GraphQLNullable<Bool> {
    get { __data["receiveInvitationEmail"] }
    set { __data["receiveInvitationEmail"] = newValue }
  }

  /// Receive mention email
  public var receiveMentionEmail: GraphQLNullable<Bool> {
    get { __data["receiveMentionEmail"] }
    set { __data["receiveMentionEmail"] = newValue }
  }

  /// Enable two factor authentication
  public var twoFactorEnabled: GraphQLNullable<Bool> {
    get { __data["twoFactorEnabled"] }
    set { __data["twoFactorEnabled"] = newValue }
  }
}
